import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

const MindMapView = ({ clients, projects, tasks }) => {
  const [nodes] = useState({
    id: 'root',
    name: 'JB APEX',
    children: clients.map(c => ({
      id: c.id,
      name: c.empresa,
      type: 'client',
      children: projects.filter(p => p.client_id === c.id).map(p => ({
        id: p.id,
        name: p.name,
        type: 'project',
        children: tasks.filter(t => t.project_id === p.id).map(t => ({
          id: t.id,
          name: t.title,
          type: 'task',
          children: []
        }))
      }))
    }))
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const { toast } = useToast();

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const addNode = () => {
    toast({ description: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀" });
  };

  const renderNode = (node) => (
    <div key={node.id} className="ml-8 my-2 relative">
      <div className="absolute -left-8 top-2.5 h-px w-8 bg-gray-300 dark:bg-gray-600"></div>
      <div className="absolute -left-8 top-2.5 w-px h-full bg-gray-300 dark:bg-gray-600"></div>
      <div className="flex items-center gap-2">
        <motion.div
          onClick={() => handleNodeClick(node)}
          className={`p-2 rounded-md cursor-pointer border ${selectedNode?.id === node.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-700' : 'bg-white dark:bg-gray-800 dark:border-gray-700'}`}
        >
          <span className="dark:text-white">{node.name}</span>
        </motion.div>
        <Button variant="ghost" size="icon" className="h-6 w-6 dark:text-gray-300 dark:hover:bg-gray-700" onClick={() => addNode(node.id)}><Plus className="h-4 w-4" /></Button>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="mt-2">
          {node.children.map(child => renderNode(child))}
        </div>
      )}
    </div>
  );

  const renderEditPanel = () => {
    if (!selectedNode) return null;
    return (
      <div className="w-80 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border dark:border-gray-700">
        <h3 className="font-semibold mb-4 dark:text-white">Editar Nó</h3>
        <Input value={selectedNode.name} onChange={() => {}} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Tipo: {selectedNode.type}</p>
        <Button className="mt-4 w-full" onClick={addNode}>Salvar</Button>
      </div>
    );
  };

  return (
    <div className="flex gap-6">
      <div className="flex-grow bg-gray-50 dark:bg-gray-900/50 p-6 rounded-lg overflow-auto" style={{ transformOrigin: 'top left' }}>
        <div className="inline-block">
          <div className="p-2 rounded-md bg-white dark:bg-gray-800 border dark:border-gray-700 font-bold dark:text-white">{nodes.name}</div>
          {nodes.children.map(child => renderNode(child))}
        </div>
      </div>
      {renderEditPanel()}
    </div>
  );
};

export default MindMapView;