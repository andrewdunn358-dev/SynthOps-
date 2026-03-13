import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Ticket, RefreshCw, Search, ExternalLink, MessageSquare, 
  Send, Clock, CheckCircle, AlertCircle, User, Building2,
  ListTodo, Plus
} from 'lucide-react';

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('open'); // Default to open tickets only
  const [stats, setStats] = useState(null);
  
  // Ticket detail dialog
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  
  // Task creation
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchStats();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await apiClient.get('/zammad/tickets?limit=200');
      setTickets(res.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load tickets'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/zammad/stats');
      setStats(res.data);
    } catch (error) {
      console.log('Stats not available');
    }
  };

  const syncTicketsToTasks = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.post('/zammad/sync-to-tasks');
      toast.success(res.data.message || 'Tickets synced to tasks');
      fetchTickets();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const openTicketDetail = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingDetail(true);
    try {
      const res = await apiClient.get(`/zammad/tickets/${ticket.id}`);
      setTicketDetail(res.data);
    } catch (error) {
      toast.error('Failed to load ticket details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    
    setSendingReply(true);
    try {
      await apiClient.post(`/zammad/tickets/${selectedTicket.id}/reply`, {
        body: replyText
      });
      toast.success('Reply sent');
      setReplyText('');
      // Refresh ticket detail
      openTicketDetail(selectedTicket);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to send reply'));
    } finally {
      setSendingReply(false);
    }
  };

  const createTaskFromTicket = async (ticket) => {
    setCreatingTask(true);
    try {
      await apiClient.post('/zammad/ticket-to-task', {
        ticket_id: ticket.id,
        title: ticket.title,
        organization: ticket.organization
      });
      toast.success('Task created from ticket');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create task'));
    } finally {
      setCreatingTask(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(search.toLowerCase()) ||
                          t.number?.toString().includes(search) ||
                          t.organization?.toLowerCase().includes(search.toLowerCase());
    const matchesState = stateFilter === 'all' || t.state === stateFilter;
    return matchesSearch && matchesState;
  });

  const getStateClass = (state) => {
    switch (state) {
      case 'new': return 'bg-blue-500/20 text-blue-400';
      case 'open': return 'bg-red-500/20 text-red-400';
      case 'pending reminder':
      case 'pending close': return 'bg-amber-500/20 text-amber-400';
      case 'closed': return 'bg-emerald-500/20 text-emerald-400';
      default: return '';
    }
  };

  const getStateIcon = (state) => {
    switch (state) {
      case 'new': return <AlertCircle className="h-4 w-4" />;
      case 'open': return <Clock className="h-4 w-4" />;
      case 'closed': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6" data-testid="tickets-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            TICKETS
          </h1>
          <p className="text-muted-foreground">Zammad support tickets</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={syncTicketsToTasks} disabled={syncing}>
            <ListTodo className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync to Tasks
          </Button>
          <Button variant="outline" onClick={() => { fetchTickets(); fetchStats(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => window.open('https://help.synthesis-it.co.uk/#ticket/create', '_blank')}>
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Tickets</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-400">{stats.open}</p>
              <p className="text-sm text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{stats.closed}</p>
              <p className="text-sm text-muted-foreground">Closed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{stats.by_state?.new || 0}</p>
              <p className="text-sm text-muted-foreground">New</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending reminder">Pending</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="empty-state py-12">
              <Ticket className="h-12 w-12" />
              <p>No tickets found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow 
                    key={ticket.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openTicketDetail(ticket)}
                  >
                    <TableCell className="font-mono text-muted-foreground">
                      {ticket.number}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{ticket.title}</span>
                        {ticket.article_count > 1 && (
                          <Badge variant="outline" className="text-xs">
                            {ticket.article_count} msgs
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{ticket.organization || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStateClass(ticket.state)}>
                        {getStateIcon(ticket.state)}
                        <span className="ml-1">{ticket.state}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{ticket.priority}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(ticket.updated_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            createTaskFromTicket(ticket);
                          }}
                          title="Create Task"
                        >
                          <ListTodo className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`https://help.synthesis-it.co.uk/#ticket/zoom/${ticket.id}`, '_blank');
                          }}
                          title="Open in Zammad"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => { setSelectedTicket(null); setTicketDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              #{selectedTicket?.number} - {selectedTicket?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedTicket?.organization} • {selectedTicket?.state}
            </DialogDescription>
          </DialogHeader>
          
          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : ticketDetail ? (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Articles/Messages */}
              <div className="space-y-3">
                {ticketDetail.articles?.map((article, idx) => (
                  <div 
                    key={article.id || idx}
                    className={`p-4 rounded-lg ${article.internal ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{article.created_by}</span>
                        {article.internal && (
                          <Badge variant="outline" className="text-xs">Internal</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(article.created_at).toLocaleString()}
                      </span>
                    </div>
                    {article.subject && article.subject !== selectedTicket?.title && (
                      <p className="text-sm font-medium mb-1">{article.subject}</p>
                    )}
                    <div 
                      className="text-sm prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: article.body }}
                    />
                  </div>
                ))}
              </div>

              {/* Reply Form */}
              <div className="border-t pt-4">
                <Label className="mb-2 block">Reply</Label>
                <Textarea
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-between items-center mt-2">
                  <Button
                    variant="outline"
                    onClick={() => createTaskFromTicket(selectedTicket)}
                    disabled={creatingTask}
                  >
                    <ListTodo className="h-4 w-4 mr-2" />
                    Create Task
                  </Button>
                  <Button onClick={sendReply} disabled={sendingReply || !replyText.trim()}>
                    <Send className={`h-4 w-4 mr-2 ${sendingReply ? 'animate-pulse' : ''}`} />
                    Send Reply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
