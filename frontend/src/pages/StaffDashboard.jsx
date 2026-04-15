import React, { useState, useEffect } from 'react';
import { apiClient, useAuth } from '../App';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Users, RefreshCw, Clock, Building2, ListTodo, User
} from 'lucide-react';

export default function StaffDashboard() {
  const { user } = useAuth();
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
  }, []);

  const fetchActivity = async () => {
    try {
      const response = await apiClient.get('/staff/activity');
      setActivity(response.data);
    } catch (error) {
      toast.error('Failed to load staff activity');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-500';
      case 'available': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6" data-testid="staff-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Barlow Condensed' }}>
            STAFF DASHBOARD
          </h1>
          <p className="text-muted-foreground">Monitor team activity and workload</p>
        </div>
        <Button variant="outline" onClick={fetchActivity} data-testid="refresh-staff">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Staff Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : activity.length === 0 ? (
            <div className="empty-state py-8">
              <Users className="h-12 w-12" />
              <p>No staff activity data</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activity.map((staff) => (
                <div 
                  key={staff.user_id}
                  className="flex items-center justify-between p-4 rounded-sm bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${getStatusColor(staff.status)}`} />
                    </div>
                    <div>
                      <p className="font-medium">{staff.username}</p>
                      <p className="text-sm text-muted-foreground capitalize">{staff.role}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {staff.current_task && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm">
                          <ListTodo className="h-3 w-3 text-muted-foreground" />
                          <span>{staff.current_task}</span>
                        </div>
                        {staff.current_client && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{staff.current_client}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="text-right min-w-[80px]">
                      <div className="flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-sm">{staff.hours_today}h</span>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`mt-1 ${staff.status === 'active' ? 'text-emerald-400 border-emerald-400/30' : ''}`}
                      >
                        {staff.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-sm">Active Staff</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {activity.filter(s => s.status === 'active').length}/{activity.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Total Hours Today</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {activity.reduce((sum, s) => sum + s.hours_today, 0).toFixed(1)}h
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ListTodo className="h-4 w-4" />
              <span className="text-sm">Staff with Tasks</span>
            </div>
            <p className="text-2xl font-bold font-mono">
              {activity.filter(s => s.current_task).length}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
