import React, { useState, useRef, useEffect } from 'react';
    import { motion } from 'framer-motion';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Users } from 'lucide-react';

    const KanbanView = ({ tasks, onUpdateStatus, onOpenTask, statusOptions, users }) => {
      const [draggedTask, setDraggedTask] = useState(null);
      const [dragOverColumn, setDragOverColumn] = useState(null);

      const sliderRef = useRef(null);
      const [isDown, setIsDown] = useState(false);
      const [startX, setStartX] = useState(0);
      const [scrollLeft, setScrollLeft] = useState(0);

      useEffect(() => {
        const slider = sliderRef.current;
        if (!slider) return;

        const handleMouseDown = (e) => {
          if (e.target.closest('button, a, [role="button"], [draggable="true"]')) {
            return;
          }
          setIsDown(true);
          slider.classList.add('active');
          setStartX(e.pageX - slider.offsetLeft);
          setScrollLeft(slider.scrollLeft);
        };

        const handleMouseLeave = () => {
          setIsDown(false);
          slider.classList.remove('active');
        };

        const handleMouseUp = () => {
          setIsDown(false);
          slider.classList.remove('active');
        };

        const handleMouseMove = (e) => {
          if (!isDown) return;
          e.preventDefault();
          const x = e.pageX - slider.offsetLeft;
          const walk = (x - startX) * 2;
          slider.scrollLeft = scrollLeft - walk;
        };

        slider.addEventListener('mousedown', handleMouseDown);
        slider.addEventListener('mouseleave', handleMouseLeave);
        slider.addEventListener('mouseup', handleMouseUp);
        slider.addEventListener('mousemove', handleMouseMove);

        return () => {
            slider.removeEventListener('mousedown', handleMouseDown);
            slider.removeEventListener('mouseleave', handleMouseLeave);
            slider.removeEventListener('mouseup', handleMouseUp);
            slider.removeEventListener('mousemove', handleMouseMove);
        };
      }, [isDown, startX, scrollLeft]);


      const handleDragStart = (e, task) => {
        setDraggedTask(task);
      };

      const handleDrop = (e, newStatus) => {
        e.preventDefault();
        if (draggedTask && draggedTask.status !== newStatus) {
          onUpdateStatus(draggedTask.id, newStatus);
        }
        setDraggedTask(null);
        setDragOverColumn(null);
      };

      const handleDragOver = (e, status) => {
        e.preventDefault();
        setDragOverColumn(status);
      };

      const getAssignees = (assigneeIds) => {
        if (!assigneeIds || assigneeIds.length === 0) return [];
        return assigneeIds.map(id => users.find(u => u.id === id)).filter(Boolean);
      };

      return (
        <div className="h-full w-full">
          <div
            ref={sliderRef}
            className="flex gap-6 h-full overflow-x-auto pb-4 cursor-grab active:cursor-grabbing"
          >
            {statusOptions.map(status => (
              <div
                key={status.value}
                onDrop={(e) => handleDrop(e, status.value)}
                onDragOver={(e) => handleDragOver(e, status.value)}
                className={`w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-lg shadow-sm transition-colors flex flex-col ${dragOverColumn === status.value ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
              >
                <div className="p-3 rounded-t-lg flex-shrink-0" style={{ backgroundColor: status.color }}>
                  <h3 className="font-semibold text-white">{status.label} ({tasks.filter(t => t.status === status.value).length})</h3>
                </div>
                <div className="flex-grow space-y-3 p-3 overflow-y-auto min-h-0">
                  {tasks.filter(t => t.status === status.value).map(task => {
                    const assignees = getAssignees(task.assignee_ids);
                    return (
                      <motion.div
                        key={task.id}
                        layout
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onClick={() => onOpenTask(task)}
                        className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm cursor-pointer border dark:border-gray-700"
                      >
                        <p className="font-medium text-sm dark:text-white">{task.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.clientes?.empresa}</p>
                        <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                          <span>{task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}</span>
                           <div className="flex items-center -space-x-2">
                                {assignees.length > 0 ? (
                                    assignees.slice(0, 2).map(assignee => (
                                        <Avatar key={assignee.id} className="h-6 w-6 border-2 border-white dark:border-gray-800">
                                            <AvatarImage src={assignee.avatar_url} />
                                            <AvatarFallback className="text-xs">{assignee.full_name ? assignee.full_name[0] : '?'}</AvatarFallback>
                                        </Avatar>
                                    ))
                                ) : (
                                    <Avatar className="h-6 w-6 border-2 border-white dark:border-gray-800">
                                        <AvatarFallback className="text-xs bg-gray-200 dark:bg-gray-700"><Users size={12}/></AvatarFallback>
                                    </Avatar>
                                )}
                                {assignees.length > 2 && (
                                     <Avatar className="h-6 w-6 border-2 border-white dark:border-gray-800">
                                        <AvatarFallback className="text-xs">+{assignees.length - 2}</AvatarFallback>
                                    </Avatar>
                                )}
                            </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    export default KanbanView;