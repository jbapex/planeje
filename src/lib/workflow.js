import { supabase } from '@/lib/customSupabaseClient';

    export const executeAutomation = async (taskId, triggerType, eventData) => {
      try {
        const { data: automations, error } = await supabase
          .from('task_automations')
          .select('*')
          .eq('is_active', true)
          .eq('trigger_type', triggerType);

        if (error) {
          console.error('Error fetching automations:', error);
          return { error };
        }

        if (!automations || automations.length === 0) {
          return { success: true, message: 'No automations found' };
        }

        const results = [];
        for (const automation of automations) {
          if (checkTrigger(automation, eventData)) {
            const result = await runActions(automation.actions, taskId, eventData);
            results.push({ automationId: automation.id, result });
          }
        }

        return { success: true, results };
      } catch (error) {
        console.error('Error executing automation:', error);
        return { error };
      }
    };

    const checkTrigger = (automation, eventData) => {
      const config = automation.trigger_config || {};
      switch (automation.trigger_type) {
        case 'status_change':
          const fromMatch = !config.from_status || config.from_status.length === 0 || config.from_status.includes(eventData.old_status);
          const toMatch = !config.to_status || config.to_status.length === 0 || config.to_status.includes(eventData.new_status);
          return fromMatch && toMatch;
        case 'task_created':
          return true;
        default:
          return false;
      }
    };

    const runActions = async (actions, taskId, eventData) => {
      const { data: task, error: fetchError } = await supabase
        .from('tarefas')
        .select('assignee_ids, status_history, status')
        .eq('id', taskId)
        .single();

      if (fetchError) {
        console.error('Error fetching task for actions:', fetchError);
        return { error: fetchError };
      }

      // Converte assignee_ids para array e garante que sejam strings (IDs)
      let currentAssignees = Array.isArray(task.assignee_ids) 
        ? task.assignee_ids.map(id => String(id)).filter(id => id && id !== 'null' && id !== 'undefined')
        : [];
      let originalAssignees = [...currentAssignees];
      let updates = {};
      let hasAssigneeChanges = false;

      // Verifica se há ação de remover assignees (tem prioridade sobre reassign_previous)
      const removeAssigneeActions = actions.filter(a => a.type === 'remove_assignee');
      const hasRemoveAllAction = removeAssigneeActions.some(a => 
        (!a.config?.assignee_ids || 
         (Array.isArray(a.config.assignee_ids) && a.config.assignee_ids.length === 0))
      );
      
      // Coleta todos os IDs que devem ser removidos (de todas as ações remove_assignee)
      const allIdsToRemove = new Set();
      removeAssigneeActions.forEach(action => {
        if (action.config?.assignee_ids && Array.isArray(action.config.assignee_ids) && action.config.assignee_ids.length > 0) {
          action.config.assignee_ids.forEach(id => {
            const idStr = String(id);
            if (idStr && idStr !== 'null' && idStr !== 'undefined') {
              allIdsToRemove.add(idStr);
            }
          });
        }
      });
      
      // Processa todas as ações em sequência
      for (const action of actions) {
        const config = action.config || {};
        
        switch (action.type) {
          case 'change_status':
            if (config.status) {
              updates.status = config.status;
            }
            break;
          case 'set_assignee':
            // Garante que config.assignee_ids é um array de strings
            let assigneesToAdd = [];
            if (Array.isArray(config.assignee_ids)) {
              assigneesToAdd = config.assignee_ids.map(id => String(id)).filter(id => id && id !== 'null' && id !== 'undefined');
            } else if (config.assignee_ids) {
              const singleId = String(config.assignee_ids);
              if (singleId && singleId !== 'null' && singleId !== 'undefined') {
                assigneesToAdd = [singleId];
              }
            }
            
            if (assigneesToAdd.length > 0) {
              // Adiciona os novos assignees, evitando duplicatas
              const beforeAdd = currentAssignees.length;
              currentAssignees = [...new Set([...currentAssignees, ...assigneesToAdd])];
              if (currentAssignees.length !== beforeAdd) {
                hasAssigneeChanges = true;
              }
            }
            break;
          case 'remove_assignee':
            // Se tem IDs específicos para remover
            if (config.assignee_ids && Array.isArray(config.assignee_ids) && config.assignee_ids.length > 0) {
              // Normaliza os IDs para remover (garante que sejam strings)
              const idsToRemove = new Set(
                config.assignee_ids
                  .map(id => String(id))
                  .filter(id => id && id !== 'null' && id !== 'undefined')
              );
              
              const beforeRemove = currentAssignees.length;
              // Remove os IDs que estão no conjunto de IDs para remover
              currentAssignees = currentAssignees.filter(id => {
                const idStr = String(id);
                return !idsToRemove.has(idStr);
              });
              
              // Marca como mudança se realmente removeu alguém
              if (currentAssignees.length !== beforeRemove) {
                hasAssigneeChanges = true;
              } else {
                // Mesmo que não tenha removido (IDs não existiam), marca como mudança
                // para garantir que a atualização seja feita e validada
                hasAssigneeChanges = true;
              }
            } else {
              // Se está vazio, null, undefined ou array vazio, remove TODOS os assignees
              const beforeRemove = currentAssignees.length;
              currentAssignees = [];
              // Marca como mudança se havia assignees antes
              if (beforeRemove > 0) {
                hasAssigneeChanges = true;
              } else {
                // Mesmo que não havia ninguém, marca como mudança para garantir atualização
                hasAssigneeChanges = true;
              }
            }
            break;
          case 'reassign_previous':
            // Só executa reassign_previous se:
            // 1. NÃO houver uma ação de remover todos os assignees, E
            // 2. O usuário que seria reatribuído NÃO está na lista de usuários a serem removidos
            if (!hasRemoveAllAction && config.from_status && task.status_history) {
                const historyReversed = [...(task.status_history || [])].reverse();
                const previousEntry = historyReversed.find(h => h.status === config.from_status && h.user_id);
                if (previousEntry && previousEntry.user_id) {
                    const newAssignee = String(previousEntry.user_id);
                    // Verifica se o usuário que seria reatribuído não está na lista de remoção
                    if (!allIdsToRemove.has(newAssignee)) {
                      if (JSON.stringify(currentAssignees) !== JSON.stringify([newAssignee])) {
                        currentAssignees = [newAssignee];
                        hasAssigneeChanges = true;
                      }
                    } else {
                      // Se o usuário está na lista de remoção, não reatribui
                      console.log('Reassign previous blocked: user is in remove list', newAssignee);
                    }
                }
            }
            break;
          case 'move_task':
             if (config.destination === 'social_media_completed') {
                const { error: moveError } = await supabase.rpc('move_task_to_social_media', { task_id: taskId });
                if (moveError) {
                  console.error('Error moving task:', moveError);
                  return { error: moveError };
                }
             }
             break;
          default:
            // Ignora ações não implementadas
            break;
        }
      }
      
      // Normaliza os assignees finais (remove duplicatas e valores inválidos)
      currentAssignees = [...new Set(currentAssignees.map(id => String(id)).filter(id => id && id !== 'null' && id !== 'undefined'))];
      const normalizedOriginal = [...new Set(originalAssignees.map(id => String(id)).filter(id => id && id !== 'null' && id !== 'undefined'))];
      
      // Compara arrays ordenados para verificar se realmente mudou
      const originalSorted = [...normalizedOriginal].sort();
      const currentSorted = [...currentAssignees].sort();
      const hasRealChanges = JSON.stringify(originalSorted) !== JSON.stringify(currentSorted);
      
      // Verifica se há ações de assignee que foram executadas
      const hasRemoveAction = actions.some(a => a.type === 'remove_assignee');
      const hasSetAction = actions.some(a => a.type === 'set_assignee');
      
      // IMPORTANTE: Sempre atualiza assignee_ids se:
      // 1. Houve mudanças reais, OU
      // 2. Foi executada uma ação de remove_assignee (mesmo que não remova, garante consistência), OU
      // 3. Foi executada uma ação de set_assignee e realmente adicionou
      if (hasRealChanges || hasAssigneeChanges || hasRemoveAction || hasSetAction) {
        updates.assignee_ids = currentAssignees;
        
        // Atualiza o status_history quando assignee_ids muda via automação
        if (task.status_history && Array.isArray(task.status_history)) {
          const newHistoryEntry = {
            status: updates.status || task.status,
            assignee_ids: currentAssignees,
            timestamp: new Date().toISOString(),
            automation: true
          };
          updates.status_history = [...task.status_history, newHistoryEntry];
        }
      }

      if (Object.keys(updates).length > 0) {
        console.log('Applying automation updates:', { taskId, updates, hasAssigneeChanges });
        const { data: updatedTask, error: updateError } = await supabase
          .from('tarefas')
          .update(updates)
          .eq('id', taskId)
          .select()
          .single();

        if (updateError) {
          console.error('Error applying automation updates:', updateError);
          return { error: updateError };
        }
        
        console.log('Automation applied successfully:', { taskId, updatedTask, assignee_ids: updatedTask.assignee_ids });
        return { success: true, updates, updatedTask };
      }
      
      console.log('No automation updates needed');
      return { success: true, message: 'No updates needed' };
    };