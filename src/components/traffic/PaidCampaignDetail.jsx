import React, { useState, useEffect, useCallback } from 'react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { ArrowLeft, Edit, Trash2, Rocket } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Badge } from '@/components/ui/badge';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import PaidCampaignForm from '@/components/forms/PaidCampaignForm';
    import { AnimatePresence } from 'framer-motion';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const PaidCampaignDetail = () => {
        const { id } = useParams();
        const navigate = useNavigate();
        const { toast } = useToast();
        const { profile } = useAuth();
        const [campaign, setCampaign] = useState(null);
        const [loading, setLoading] = useState(true);
        const [showForm, setShowForm] = useState(false);
        
        const [clients, setClients] = useState([]);
        const [users, setUsers] = useState([]);
        const [tasks, setTasks] = useState([]);
        const [allCampaigns, setAllCampaigns] = useState([]);


        const fetchData = useCallback(async () => {
            setLoading(true);
            const { data: campaignData, error } = await supabase
                .from('paid_campaigns')
                .select('*, clientes(*), profiles!assignee_id(*)')
                .eq('id', id)
                .single();

            if (error || !campaignData) {
                toast({ title: 'Erro ao buscar campanha', description: error?.message || 'Campanha não encontrada', variant: 'destructive' });
                navigate('/paid-traffic');
                return;
            }
            setCampaign(campaignData);
            setLoading(false);
        }, [id, navigate, toast]);
        
        const fetchDropdownData = useCallback(async () => {
            const { data: clientsData } = await supabase.from('clientes').select('id, empresa');
            setClients(clientsData || []);

            const { data: usersData } = await supabase.from('profiles').select('id, full_name, avatar_url');
            setUsers(usersData || []);

            const { data: tasksData } = await supabase.from('tarefas').select('id, title, description');
            setTasks(tasksData || []);
            
            const { data: campaignsData } = await supabase.from('paid_campaigns').select('*');
            setAllCampaigns(campaignsData || []);
        }, []);


        useEffect(() => {
            fetchData();
        }, [fetchData]);

        const handleDelete = async () => {
            const { error } = await supabase.from('paid_campaigns').delete().eq('id', id);
            if (error) {
                toast({ title: 'Erro ao excluir campanha', description: error.message, variant: 'destructive' });
            } else {
                toast({ title: 'Campanha excluída com sucesso!' });
                navigate('/paid-traffic');
            }
        };
        
        const handleSave = async (formData) => {
            const { error } = await supabase.rpc('create_ad_from_structure', { form_data: formData });

            if (error) {
            toast({ title: `Erro ao salvar estrutura`, description: error.message, variant: "destructive" });
            } else {
            toast({ title: `Estrutura da campanha salva com sucesso!` });
            setShowForm(false);
            fetchData();
            }
        };

        const handleOpenForm = () => {
            fetchDropdownData();
            setShowForm(true);
        }

        if (loading) {
            return <div className="flex items-center justify-center h-full"><p className="dark:text-gray-300">Carregando detalhes da campanha...</p></div>;
        }

        if (!campaign) {
            return null;
        }

        const ad = campaign.ad_sets?.[0]?.ads?.[0] || {};
        const adSetName = campaign.ad_sets?.[0]?.name || 'N/A';
        const adName = ad.name || 'N/A';

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => navigate('/paid-traffic')} className="dark:text-gray-300 dark:hover:bg-gray-700">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Tráfego Pago
                    </Button>
                    {(profile?.role === 'superadmin' || profile?.role === 'admin') && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={handleOpenForm} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600">
                                <Edit className="mr-2 h-4 w-4" /> Editar
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle>
                                        <AlertDialogDescription className="dark:text-gray-400">
                                            Esta ação não pode ser desfeita. Isso excluirá permanentemente a campanha "{campaign.name}".
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-3xl font-bold flex items-center gap-3 dark:text-white">
                                    <Rocket className="h-8 w-8 text-blue-500" />
                                    {campaign.name}
                                </CardTitle>
                                <p className="text-lg text-gray-500 dark:text-gray-400">{campaign.clientes?.empresa}</p>
                            </div>
                            <Badge variant="secondary" className="text-base px-4 py-2 dark:bg-gray-700 dark:text-gray-300">{campaign.status}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                       <Card>
                           <CardHeader><CardTitle className="text-lg dark:text-white">Conjunto: {adSetName}</CardTitle></CardHeader>
                       </Card>
                        <Card>
                           <CardHeader><CardTitle className="text-lg dark:text-white">Anúncio: {adName}</CardTitle></CardHeader>
                           <CardContent>
                               <p className="text-sm dark:text-gray-300">{ad.description}</p>
                           </CardContent>
                       </Card>
                    </CardContent>
                </Card>
                
                <AnimatePresence>
                    {showForm && (
                        <PaidCampaignForm
                            campaign={campaign}
                            clients={clients}
                            users={users}
                            tasks={tasks}
                            onSave={handleSave}
                            onClose={() => setShowForm(false)}
                            campaigns={allCampaigns}
                            onDataChange={fetchData}
                        />
                    )}
                </AnimatePresence>
            </div>
        );
    };

    export default PaidCampaignDetail;