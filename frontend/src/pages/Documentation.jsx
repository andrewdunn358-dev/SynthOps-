import React, { useState, useEffect } from 'react';
import { apiClient } from '../App';
import { toast } from 'sonner';
import { getErrorMessage } from '../lib/errorHandler';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { FileText, Plus, Search, Edit, Trash2, Eye } from 'lucide-react';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';

const CATEGORIES = [
  'General',
  'Active Directory',
  'Backup & Recovery',
  'Network',
  'Security',
  'Hyper-V',
  'Windows Server',
  'Troubleshooting',
  'Best Practices'
];

export default function Documentation() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);

  const [form, setForm] = useState({
    title: '',
    category: 'General',
    content: '',
    is_published: true
  });

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    try {
      const response = await apiClient.get('/docs');
      setDocs(response.data);
    } catch (error) {
      toast.error('Failed to load documentation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDoc) {
        await apiClient.put(`/docs/${editingDoc.id}`, form);
        toast.success('Document updated');
      } else {
        await apiClient.post('/docs', form);
        toast.success('Document created');
      }
      setDialogOpen(false);
      resetForm();
      fetchDocs();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to save document'));
    }
  };

  const handleEdit = (doc) => {
    setEditingDoc(doc);
    setForm({
      title: doc.title,
      category: doc.category || 'General',
      content: doc.content,
      is_published: doc.is_published
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await apiClient.delete(`/docs/${id}`);
      toast.success('Document deleted');
      fetchDocs();
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  const resetForm = () => {
    setEditingDoc(null);
    setForm({
      title: '',
      category: 'General',
      content: '',
      is_published: true
    });
  };

  const filteredDocs = docs.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || d.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Simple markdown renderer.
  //
  // Important: the previous version piped raw user-authored content
  // straight into dangerouslySetInnerHTML, which was an XSS vector — a
  // doc containing `<script>alert(1)</script>` or `<img src=x onerror=...>`
  // would execute on render. We avoid it by HTML-escaping the input
  // FIRST, then applying the markdown transforms. The transforms only
  // match `#`, `*`, backtick, and `-` (none HTML-special) and substitute
  // fixed HTML we control, so the resulting output is safe.
  //
  // If we ever want fuller markdown (tables, fenced code blocks,
  // syntax highlighting, link auto-detection), swap this for
  // react-markdown — it renders proper React elements without
  // dangerouslySetInnerHTML at all and is XSS-safe by construction.
  const renderMarkdown = (content) => {
    if (!content) return '';

    // Escape & first to avoid double-escaping the entities we add below
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    return escaped
      .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`(.*?)`/gim, '<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
      .replace(/\n/gim, '<br />');
  };

  return (
    <div className="space-y-6" data-testid="documentation-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            DOCUMENTATION
          </h1>
          <p className="text-muted-foreground">Runbooks and procedures</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="add-doc">
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingDoc ? 'Edit Document' : 'Add New Document'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Document title"
                    required
                    data-testid="doc-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger data-testid="doc-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Content (Markdown supported)</Label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="# Heading&#10;&#10;Write your documentation here...&#10;&#10;- Item 1&#10;- Item 2"
                  rows={15}
                  className="font-mono text-sm"
                  data-testid="doc-content"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" data-testid="save-doc">
                  {editingDoc ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documentation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="search-docs"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="empty-state">
              <FileText className="h-16 w-16" />
              <p className="text-lg font-medium">No documentation found</p>
              <p className="text-muted-foreground">Create your first document to get started</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => (
            <Card 
              key={doc.id} 
              className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setViewDoc(doc)}
              data-testid={`doc-card-${doc.slug}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{doc.title}</h3>
                      <Badge variant="outline" className="mt-1">{doc.category}</Badge>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                  {doc.content?.substring(0, 100)}...
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(doc)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Document Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {viewDoc?.title}
            </DialogTitle>
            {viewDoc?.category && (
              <Badge variant="outline">{viewDoc.category}</Badge>
            )}
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div 
              className="doc-content prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewDoc?.content) }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
