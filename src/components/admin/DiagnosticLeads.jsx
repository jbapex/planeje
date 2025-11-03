import React, { useState, useEffect, useMemo, useCallback } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { Badge } from "@/components/ui/badge";
    import { Button } from "@/components/ui/button";
    import { Input } from "@/components/ui/input";
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
    import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
    import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
    import { Checkbox } from "@/components/ui/checkbox";
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Calendar } from "@/components/ui/calendar";
    import { format, subDays } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { Loader2, MoreHorizontal, Search, CalendarPlus as CalendarIcon, Users, CheckCircle, TrendingUp, BarChart, SlidersHorizontal, UserPlus, MessageCircle, FileDown, Trash2 } from 'lucide-react';
    import { useToast } from '@/components/ui/use-toast';

    const leadStatuses = [
      { value: 'Novo', label: 'Novo', color: 'bg-blue-500' },
      { value: 'Em Contato', label: 'Em Contato', color: 'bg-yellow-500' },
      { value: 'Convertido', label: 'Convertido', color: 'bg-green-500' },
      { value: 'Descartado', label: 'Descartado', color: 'bg-gray-500' },
    ];

    const DiagnosticLeads = () => {
      const [leads, setLeads] = useState([]);
      const [team, setTeam] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [selectedLead, setSelectedLead] = useState(null);
      const [isDrawerOpen, setIsDrawerOpen] = useState(false);
      const [filters, setFilters] = useState({ search: '', status: [], dateRange: { from: subDays(new Date(), 30), to: new Date() } });
      const [selection, setSelection] = useState({});
      const { toast } = useToast();

      const fetchData = useCallback(async () => {
        setLoading(true);
        let query = supabase
          .from('diagnostic_submissions')
          .select('*, assigned_profile:profiles(id, full_name, avatar_url)')
          .order('created_at', { ascending: false });

        if (filters.search) {
          query = query.or(`nome.ilike.%${filters.search}%,instagram.ilike.%${filters.search}%`);
        }
        if (filters.status.length > 0) {
          query = query.in('status', filters.status);
        }
        if (filters.dateRange.from) {
          query = query.gte('created_at', filters.dateRange.from.toISOString());
        }
        if (filters.dateRange.to) {
          query = query.lte('created_at', filters.dateRange.to.toISOString());
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching diagnostic leads:', error);
          setError('Não foi possível carregar os leads.');
        } else {
          setLeads(data);
        }
        setLoading(false);
      }, [filters]);

      useEffect(() => {
        fetchData();
      }, [fetchData]);

      useEffect(() => {
        const fetchTeam = async () => {
          const { data } = await supabase.from('profiles').select('id, full_name');
          setTeam(data || []);
        };
        fetchTeam();
      }, []);

      const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
      };

      const handleStatusChange = async (leadId, newStatus) => {
        const { error } = await supabase.from('diagnostic_submissions').update({ status: newStatus }).eq('id', leadId);
        if (error) {
          toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
        } else {
          toast({ title: "Sucesso", description: "Status atualizado." });
          fetchData();
        }
      };

      const handleAssigneeChange = async (leadId, assigneeId) => {
        const { error } = await supabase.from('diagnostic_submissions').update({ assigned_to: assigneeId }).eq('id', leadId);
        if (error) {
          toast({ title: "Erro", description: "Não foi possível atribuir o lead.", variant: "destructive" });
        } else {
          toast({ title: "Sucesso", description: "Lead atribuído." });
          fetchData();
        }
      };

      const kpiData = useMemo(() => {
        const completed = leads.length;
        const totalScore = leads.reduce((acc, lead) => acc + (lead.nota || 0), 0);
        const avgScore = completed > 0 ? (totalScore / completed).toFixed(0) : 0;
        return { completed, avgScore };
      }, [leads]);

      const handleSelectRow = (id) => {
        setSelection(prev => ({ ...prev, [id]: !prev[id] }));
      };

      const handleSelectAll = (e) => {
        const isChecked = e.target.checked;
        const newSelection = {};
        if (isChecked) {
          leads.forEach(lead => newSelection[lead.id] = true);
        }
        setSelection(newSelection);
      };

      const selectedIds = useMemo(() => Object.keys(selection).filter(id => selection[id]), [selection]);

      const handleBulkAction = async (action, value) => {
        if (selectedIds.length === 0) return;
        let updateData = {};
        if (action === 'status') updateData = { status: value };
        if (action === 'assign') updateData = { assigned_to: value };

        const { error } = await supabase.from('diagnostic_submissions').update(updateData).in('id', selectedIds);
        if (error) {
          toast({ title: "Erro", description: "Ação em massa falhou.", variant: "destructive" });
        } else {
          toast({ title: "Sucesso", description: "Leads atualizados." });
          setSelection({});
          fetchData();
        }
      };

      const handleNotImplemented = () => toast({ title: "🚧 Não implementado", description: "Esta funcionalidade será adicionada em breve! 🚀" });

      return (
        <div className="p-4 md:p-6">
          <h2 className="text-2xl font-bold mb-6">Leads do Diagnóstico de Marketing</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Diagnósticos Concluídos</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpiData.completed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Nota Média</CardTitle>
                <BarChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpiData.avgScore}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Acessos</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">N/A</div>
                <p className="text-xs text-muted-foreground">Integração pendente</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">N/A</div>
                 <p className="text-xs text-muted-foreground">Integração pendente</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou Instagram" className="pl-10" value={filters.search} onChange={e => handleFilterChange('search', e.target.value)} />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-grow sm:flex-grow-0">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateRange.from ? `${format(filters.dateRange.from, 'dd/MM/yy')} - ${format(filters.dateRange.to, 'dd/MM/yy')}` : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="range" selected={filters.dateRange} onSelect={date => handleFilterChange('dateRange', date)} locale={ptBR} />
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-grow sm:flex-grow-0">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Status ({filters.status.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {leadStatuses.map(status => (
                  <DropdownMenuItem key={status.value} onSelect={() => {
                    const newStatus = filters.status.includes(status.value)
                      ? filters.status.filter(s => s !== status.value)
                      : [...filters.status, status.value];
                    handleFilterChange('status', newStatus);
                  }}>
                    <Checkbox checked={filters.status.includes(status.value)} className="mr-2" />
                    {status.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">Ações em Massa ({selectedIds.length})</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Marcar Status</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {leadStatuses.map(status => (
                        <DropdownMenuItem key={status.value} onSelect={() => handleBulkAction('status', status.value)}>{status.label}</DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Atribuir</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {team.map(member => (
                        <DropdownMenuItem key={member.id} onSelect={() => handleBulkAction('assign', member.id)}>{member.full_name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleNotImplemented}><FileDown className="mr-2 h-4 w-4" />Exportar CSV</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleNotImplemented} className="text-red-500"><Trash2 className="mr-2 h-4 w-4" />Deletar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"><Checkbox onCheckedChange={(checked) => handleSelectAll({ target: { checked } })} checked={selectedIds.length === leads.length && leads.length > 0} /></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Instagram</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Atribuído a</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Nota</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[40px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></TableCell></TableRow>
                ) : leads.length > 0 ? (
                  leads.map((lead) => (
                    <TableRow key={lead.id} data-state={selection[lead.id] ? "selected" : ""}>
                      <TableCell><Checkbox checked={!!selection[lead.id]} onCheckedChange={() => handleSelectRow(lead.id)} /></TableCell>
                      <TableCell className="font-medium">{lead.nome}</TableCell>
                      <TableCell>
                        <a href={`https://instagram.com/${lead.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">{lead.instagram}</a>
                      </TableCell>
                      <TableCell>
                        <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline text-xs">{lead.whatsapp}</a>
                      </TableCell>
                      <TableCell>{lead.assigned_profile?.full_name || 'Não atribuído'}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: leadStatuses.find(s => s.value === lead.status)?.color || '#888' }} className="text-white">{lead.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{lead.nota}</TableCell>
                      <TableCell>{format(new Date(lead.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => { setSelectedLead(lead); setIsDrawerOpen(true); }}>Ver Detalhes</DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Marcar Status</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {leadStatuses.map(status => (
                                  <DropdownMenuItem key={status.value} onSelect={() => handleStatusChange(lead.id, status.value)}>{status.label}</DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Atribuir a</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {team.map(member => (
                                  <DropdownMenuItem key={member.id} onSelect={() => handleAssigneeChange(lead.id, member.id)}>{member.full_name}</DropdownMenuItem>
                                ))}
                                 <DropdownMenuItem onSelect={() => handleAssigneeChange(lead.id, null)}>Remover atribuição</DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={handleNotImplemented}><UserPlus className="mr-2 h-4 w-4" />Criar Usuário</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.open(`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`, '_blank')}><MessageCircle className="mr-2 h-4 w-4" />Abrir WhatsApp</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center">Nenhum lead encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <DrawerContent className="max-h-[90vh]">
              <div className="p-4 overflow-y-auto">
                {selectedLead && (
                  <>
                    <DrawerHeader>
                      <DrawerTitle>Detalhes do Lead: {selectedLead.nome}</DrawerTitle>
                      <DrawerDescription>Enviado em {format(new Date(selectedLead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</DrawerDescription>
                    </DrawerHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                      <div>
                        <h3 className="font-semibold mb-2">Respostas do Diagnóstico</h3>
                        <div className="space-y-2 text-sm">
                          {selectedLead.answers.map((a, i) => (
                            <div key={i} className="p-2 bg-muted rounded-md">
                              <p className="font-medium">{a.question}</p>
                              <p className="text-muted-foreground">{a.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Análise da IA</h3>
                        <Card>
                          <CardContent className="p-4">
                            <p className="font-medium">Feedback:</p>
                            <p className="text-sm text-muted-foreground mb-4">{selectedLead.feedback}</p>
                            <p className="font-medium">Travas Identificadas:</p>
                            <ul className="list-disc list-inside text-sm text-muted-foreground">
                              {selectedLead.travas.map((trava, i) => <li key={i}>{trava}</li>)}
                            </ul>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      );
    };

    export default DiagnosticLeads;