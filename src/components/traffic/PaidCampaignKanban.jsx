import React, { useState } from 'react';
    import { motion } from 'framer-motion';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { DollarSign, BarChart, Edit, Trash2, MoreHorizontal, User, Rocket, Layers } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Badge } from '@/components/ui/badge';
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

    const KpiDisplay = ({ kpis }) => (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="mt-2 w-full dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600">
            <BarChart className="h-4 w-4 mr-2" /> Ver KPIs
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 dark:bg-gray-800 dark:border-gray-700">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none dark:text-white">KPIs da Campanha</h4>
              <p className="text-sm text-muted-foreground dark:text-gray-400">Metas e resultados atuais.</p>
            </div>
            <div className="grid gap-2">
              {kpis.map((kpi, index) => (
                <div key={index} className="grid grid-cols-3 items-center gap-4 text-sm">
                  <span className="font-semibold col-span-1 dark:text-gray-300">{kpi.name}</span>
                  <span className="text-right dark:text-gray-400">Meta: {kpi.target}</span>
                  <span className="text-right font-bold dark:text-white">Atual: {kpi.current}</span>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );

    const CampaignCard = ({ campaign, onOpenDetails, onDelete, userRole }) => {
      const assignee = campaign.profiles;
      const [isAlertOpen, setIsAlertOpen] = useState(false);
      
      const campaignDisplayName = campaign.ad_sets && campaign.ad_sets.length > 0 && campaign.ad_sets[0].ads && campaign.ad_sets[0].ads.length > 0
        ? campaign.ad_sets[0].ads[0].name
        : campaign.name;

      const handleDeleteClick = (e) => {
        e.stopPropagation();
        onDelete(campaign.id);
        setIsAlertOpen(false);
      };

      return (
        <motion.div layout>
          <Card 
            onClick={() => onOpenDetails(campaign)}
            className="dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer"
          >
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <CardTitle className="text-base font-semibold dark:text-white">{campaignDisplayName}</CardTitle>
              {(userRole === 'superadmin' || userRole === 'admin') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-6 w-6 p-0" onClick={e => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(campaign);}} className="dark:text-white dark:hover:bg-gray-700"><Edit className="mr-2 h-4 w-4" /> Detalhes</DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); e.stopPropagation(); setIsAlertOpen(true); }} className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="secondary" className="dark:bg-gray-700 dark:text-gray-300">{campaign.clientes?.empresa || 'Sem cliente'}</Badge>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{campaign.description}</p>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center font-semibold dark:text-white">
                  <DollarSign className="h-4 w-4 mr-1 text-green-500" />
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(campaign.budget || 0)}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Layers size={12}/>
                        {campaign.ad_sets?.length || 0}
                    </div>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={assignee?.avatar_url} />
                    <AvatarFallback className="text-xs dark:bg-gray-700 dark:text-white">{assignee?.full_name ? assignee.full_name.charAt(0) : <User size={12} />}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              {campaign.kpis && campaign.kpis.length > 0 && <div onClick={e => e.stopPropagation()}><KpiDisplay kpis={campaign.kpis} /></div>}
            </CardContent>
          </Card>
          <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent onClick={e => e.stopPropagation()} className="dark:bg-gray-800 dark:border-gray-700">
              <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Excluir permanentemente a campanha "{campaignDisplayName}".</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={e => {e.stopPropagation(); setIsAlertOpen(false);}} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteClick} className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      );
    };

    const PaidCampaignKanban = ({ campaigns, statuses, onOpenDetails, onDelete, onUpdateStatus, userRole }) => {
      const [draggedCampaign, setDraggedCampaign] = useState(null);
      const [dragOverColumn, setDragOverColumn] = useState(null);

      const handleDragStart = (e, campaign) => {
        setDraggedCampaign(campaign);
      };

      const handleDrop = (e, newStatus) => {
        e.preventDefault();
        if (draggedCampaign && draggedCampaign.status !== newStatus) {
          onUpdateStatus(draggedCampaign.id, newStatus);
        }
        setDraggedCampaign(null);
        setDragOverColumn(null);
      };

      const handleDragOver = (e, status) => {
        e.preventDefault();
        setDragOverColumn(status);
      };

      if (campaigns.length === 0) {
        return (
          <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <Rocket className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Nenhuma campanha encontrada</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tente ajustar os filtros ou crie uma nova campanha.</p>
          </div>
        );
      }

      return (
        <div className="flex gap-6 overflow-x-auto pb-4 h-full">
          {statuses.map(column => (
            <div
              key={column.value}
              onDrop={(e) => handleDrop(e, column.value)}
              onDragOver={(e) => handleDragOver(e, column.value)}
              className={`w-80 flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 rounded-lg transition-colors ${dragOverColumn === column.value ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
            >
              <div className={`p-3 rounded-t-lg ${column.color || 'bg-gray-500'} flex justify-between items-center`}>
                <h3 className="font-semibold text-white">{column.label}</h3>
                <span className="text-sm font-bold text-white bg-white/20 rounded-full px-2 py-0.5">
                  {campaigns.filter(c => c.status === column.value).length}
                </span>
              </div>
              <div className="space-y-3 min-h-[200px] p-3 overflow-y-auto h-[calc(100%-48px)]">
                {campaigns.filter(c => c.status === column.value).map(campaign => (
                  <div key={campaign.id} draggable onDragStart={(e) => handleDragStart(e, campaign)}>
                    <CampaignCard campaign={campaign} onOpenDetails={onOpenDetails} onDelete={onDelete} userRole={userRole} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    };

    export default PaidCampaignKanban;