import React, { useState } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { Button } from '@/components/ui/button';
    import { Badge } from '@/components/ui/badge';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { ChevronDown, ChevronRight, Edit, Trash2, Rocket, User } from 'lucide-react';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
    
    const AdRow = ({ ad, level, onOpenDetails, onDelete, userRole, campaign, statuses }) => {
      const [isAlertOpen, setIsAlertOpen] = useState(false);
      const statusConfig = statuses.find(s => s.value === campaign.status) || {};

      const handleDeleteClick = (e) => {
        e.stopPropagation();
        onDelete(campaign.id); 
        setIsAlertOpen(false);
      };

      return (
        <>
          <TableRow className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => onOpenDetails(campaign)}>
            <TableCell style={{ paddingLeft: `${level * 20}px` }}>
              <div className="flex items-center gap-2">
                <span className="font-medium dark:text-white">{ad.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="dark:bg-gray-600 dark:text-gray-300">Anúncio</Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${statusConfig.color || 'bg-gray-400'}`} />
                <span className="dark:text-gray-300">{statusConfig.label || 'N/A'}</span>
              </div>
            </TableCell>
            <TableCell className="text-right dark:text-gray-300">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ad.budget || 0)}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-2">
                {(userRole === 'superadmin' || userRole === 'admin') && (
                  <>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onOpenDetails(campaign);}} className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setIsAlertOpen(true); }} className="h-8 w-8 text-red-500"><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
          <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Atenção</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">A exclusão de um anúncio individual ainda não é suportada. Esta ação excluirá toda a campanha "{campaign.name}". Deseja continuar?</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteClick} className="bg-red-600 hover:bg-red-700">Excluir Campanha</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    };

    const AdSetRow = ({ adSet, level, onOpenDetails, onDelete, userRole, campaign, statuses }) => {
      const [isExpanded, setIsExpanded] = useState(false);
      const statusConfig = statuses.find(s => s.value === campaign.status) || {};

      return (
        <>
          <TableRow className="dark:bg-gray-800/50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <TableCell style={{ paddingLeft: `${level * 20}px` }}>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-6 w-6">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <span className="font-medium dark:text-white">{adSet.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="dark:bg-gray-600 dark:text-gray-300">Conjunto</Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${statusConfig.color || 'bg-gray-400'}`} />
                <span className="dark:text-gray-300">{statusConfig.label || 'N/A'}</span>
              </div>
            </TableCell>
            <TableCell className="text-right dark:text-gray-300">-</TableCell>
            <TableCell></TableCell>
          </TableRow>
          {isExpanded && adSet.ads?.map(ad => (
            <AdRow key={ad.id} ad={ad} level={level + 1} onOpenDetails={onOpenDetails} onDelete={onDelete} userRole={userRole} campaign={campaign} statuses={statuses}/>
          ))}
        </>
      );
    };

    const CampaignRow = ({ campaign, onOpenDetails, onDelete, userRole, users, statuses }) => {
      const [isExpanded, setIsExpanded] = useState(false);
      const assignee = users && Array.isArray(users) ? users.find(u => u.id === campaign.assignee_id) : null;
      const statusConfig = statuses && Array.isArray(statuses) ? statuses.find(s => s.value === campaign.status) || {} : {};

      return (
        <>
          <TableRow className="bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 font-semibold hover:bg-gray-100 dark:hover:bg-gray-800/50">
            <TableCell>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)} className="h-6 w-6">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <span className="dark:text-white">{campaign.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge>Campanha</Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${statusConfig.color || 'bg-gray-400'}`} />
                <span className="dark:text-gray-300">{statusConfig.label || 'N/A'}</span>
              </div>
            </TableCell>
            <TableCell className="text-right dark:text-gray-300">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(campaign.budget || 0)}
            </TableCell>
            <TableCell className="flex justify-end items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">{campaign.clientes?.empresa}</span>
              <Avatar className="h-8 w-8">
                <AvatarImage src={assignee?.avatar_url} />
                <AvatarFallback className="text-xs dark:bg-gray-700 dark:text-white">{assignee?.full_name ? assignee.full_name.charAt(0) : <User size={12} />}</AvatarFallback>
              </Avatar>
            </TableCell>
          </TableRow>
          <AnimatePresence>
            {isExpanded && (
              <motion.tr
                className="contents"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {campaign.ad_sets?.map(adSet => (
                  <AdSetRow key={adSet.id} adSet={adSet} level={1} onOpenDetails={onOpenDetails} onDelete={onDelete} userRole={userRole} campaign={campaign} statuses={statuses}/>
                ))}
              </motion.tr>
            )}
          </AnimatePresence>
        </>
      );
    };

    const PaidCampaignList = ({ campaigns, onOpenDetails, onDelete, userRole, users, statuses }) => {
      if (campaigns.length === 0) {
        return (
          <div className="text-center py-20 bg-white dark:bg-gray-800/50 rounded-lg">
            <Rocket className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Nenhuma campanha encontrada</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tente ajustar os filtros ou crie uma nova campanha.</p>
          </div>
        );
      }

      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="dark:bg-gray-900">
              <TableRow className="dark:border-gray-700">
                <TableHead className="w-[40%] dark:text-white">Nome</TableHead>
                <TableHead className="dark:text-white">Nível</TableHead>
                <TableHead className="dark:text-white">Status</TableHead>
                <TableHead className="text-right dark:text-white">Orçamento</TableHead>
                <TableHead className="text-right dark:text-white">Ações / Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map(campaign => (
                <CampaignRow key={campaign.id} campaign={campaign} onOpenDetails={onOpenDetails} onDelete={onDelete} userRole={userRole} users={users} statuses={statuses} />
              ))}
            </TableBody>
          </Table>
        </div>
      );
    };

    export default PaidCampaignList;