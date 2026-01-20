import { supabase } from '@/lib/customSupabaseClient';

    // Cache simples de automações (5 segundos de TTL)
    let automationsCache = null;
    let cacheTimestamp = 0;
    const CACHE_TTL = 5000; // 5 segundos

    const getCachedAutomations = async (triggerType) => {
      const now = Date.now();
      if (automationsCache && (now - cacheTimestamp) < CACHE_TTL) {
        // Retorna apenas as automações do tipo solicitado
        return automationsCache.filter(a => a.trigger_type === triggerType);
      }
      
      // Busca todas as automações ativas
      const { data, error } = await supabase
        .from('task_automations')
        .select('*')
        .eq('is_active', true);
      
      if (error) {
        return { error };
      }
      
      automationsCache = data || [];
      cacheTimestamp = now;
      return automationsCache.filter(a => a.trigger_type === triggerType);
    };

    export const executeAutomation = async (taskId, triggerType, eventData) => {
      const startTime = performance.now();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:3',message:'executeAutomation START',data:{taskId,triggerType,eventData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      try {
        // IMPORTANTE: Automações devem ser globais, não filtradas por owner_id
        // Se houver RLS bloqueando, isso garante que todas as automações ativas sejam encontradas
        const queryStart = performance.now();
        const automationsResult = await getCachedAutomations(triggerType);
        const queryTime = performance.now() - queryStart;
        
        if (automationsResult.error) {
          const error = automationsResult.error;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:10',message:'Automations query error',data:{queryTime:queryTime.toFixed(2),error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error('Error fetching automations:', error);
          return { error };
        }
        
        const automations = automationsResult;
        const now = Date.now();
        const fromCache = automationsCache && (now - cacheTimestamp) < CACHE_TTL;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:10',message:'Automations query completed',data:{queryTime:queryTime.toFixed(2),automationsCount:automations?.length||0,fromCache},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        if (!automations || automations.length === 0) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:18',message:'No automations found',data:{triggerType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          return { success: true, message: 'No automations found' };
        }

        const results = [];
        for (const automation of automations) {
          const triggerStart = performance.now();
          const triggerPassed = checkTrigger(automation, eventData);
          const triggerTime = performance.now() - triggerStart;
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:24',message:'Trigger check',data:{automationId:automation.id,triggerPassed,triggerTime:triggerTime.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          if (triggerPassed) {
            const actionStart = performance.now();
            const result = await runActions(automation.actions, taskId, eventData);
            const actionTime = performance.now() - actionStart;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:26',message:'Actions executed',data:{automationId:automation.id,actionTime:actionTime.toFixed(2),success:result?.success,hasUpdatedTask:!!result?.updatedTask},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            results.push({ automationId: automation.id, result });
          }
        }

        const totalTime = performance.now() - startTime;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:31',message:'executeAutomation COMPLETE',data:{taskId,totalTime:totalTime.toFixed(2),resultsCount:results.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return { success: true, results };
      } catch (error) {
        const totalTime = performance.now() - startTime;
        console.error('Error executing automation:', error);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:33',message:'executeAutomation ERROR',data:{taskId,error:error.message,totalTime:totalTime.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'workflow.js:117',
          message: 'runActions START',
          data: {
            taskId,
            actions: actions?.map(a => ({ type: a.type, config: a.config })),
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'S',
        }),
      }).catch(() => {});
      // #endregion
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
          case 'move_task_to_social_media':
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: 'workflow.js:248',
                message: 'Move task action detected',
                data: { taskId, actionType: action.type, config },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                runId: 'run1',
                hypothesisId: 'P',
              }),
            }).catch(() => {});
            // #endregion

            if (config.destination === 'social_media_completed') {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'workflow.js:258',
                  message: 'Move task to social media START',
                  data: { taskId, destination: config.destination },
                  timestamp: Date.now(),
                  sessionId: 'debug-session',
                  runId: 'run1',
                  hypothesisId: 'Q',
                }),
              }).catch(() => {});
              // #endregion

              const { error: moveError } = await supabase.rpc('move_task_to_social_media', { task_id: taskId });

              if (moveError) {
                console.error('Error moving task:', moveError);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    location: 'workflow.js:268',
                    message: 'Move task to social media ERROR',
                    data: { taskId, error: moveError.message, code: moveError.code },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    runId: 'run1',
                    hypothesisId: 'R',
                  }),
                }).catch(() => {});
                // #endregion
                return { error: moveError };
              }

              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  location: 'workflow.js:278',
                  message: 'Move task to social media SUCCESS',
                  data: { taskId, destination: config.destination },
                  timestamp: Date.now(),
                  sessionId: 'debug-session',
                  runId: 'run1',
                  hypothesisId: 'S',
                }),
              }).catch(() => {});
              // #endregion
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
        const updateStart = performance.now();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:293',message:'Applying automation updates',data:{taskId,updates,hasAssigneeChanges},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
        // #endregion
        const { data: updatedTask, error: updateError } = await supabase
          .from('tarefas')
          .update(updates)
          .eq('id', taskId)
          .select()
          .single();
        const updateTime = performance.now() - updateStart;

        if (updateError) {
          console.error('Error applying automation updates:', updateError);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:302',message:'Update error',data:{taskId,error:updateError.message,updateTime:updateTime.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
          // #endregion
          return { error: updateError };
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:307',message:'Update successful',data:{taskId,updateTime:updateTime.toFixed(2),assigneeIds:updatedTask.assignee_ids,status:updatedTask.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
        // #endregion
        return { success: true, updates, updatedTask };
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workflow.js:312',message:'No updates needed',data:{taskId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
      // #endregion
      return { success: true, message: 'No updates needed' };
    };