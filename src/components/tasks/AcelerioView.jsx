import React from 'react';
    import { motion } from 'framer-motion';

    const AcelerioView = ({ tasks, onOpenTask, statusOptions }) => {
      const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      };

      const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
          y: 0,
          opacity: 1,
        },
      };

      return (
        <motion.div
          className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Visão Acelerio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.length > 0 ? (
              tasks.map(task => {
                const statusInfo = statusOptions.find(s => s.value === task.status);
                return (
                  <motion.div
                    key={task.id}
                    className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow duration-300"
                    onClick={() => onOpenTask(task)}
                    variants={itemVariants}
                    whileHover={{ scale: 1.03 }}
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate pr-4">{task.title}</h3>
                      {statusInfo && (
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full text-white ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 truncate">
                      {task.description || 'Sem descrição'}
                    </p>
                    <div className="mt-4 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                      <span>{task.clientes?.empresa || 'Sem cliente'}</span>
                      {task.due_date && <span>Entrega: {task.due_date}</span>}
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-10">
                <p className="text-gray-500 dark:text-gray-400">Nenhuma tarefa encontrada para a visão Acelerio.</p>
              </div>
            )}
          </div>
        </motion.div>
      );
    };

    export default AcelerioView;