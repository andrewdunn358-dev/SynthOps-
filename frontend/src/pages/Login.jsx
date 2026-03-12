import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', username: '', password: '', confirmPassword: '' });

  const from = location.state?.from?.pathname || '/';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.email || !registerForm.username || !registerForm.password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (registerForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      await register(registerForm.email, registerForm.username, registerForm.password);
      toast.success('Account created! Please login.');
      setLoginForm({ email: registerForm.email, password: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen login-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      
      <div className="relative z-10 w-full max-w-md animate-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">S</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white" style={{ fontFamily: 'Barlow Condensed' }}>
              SYNTHOPS
            </h1>
          </div>
          <p className="text-muted-foreground">IT Operations Portal</p>
        </div>

        <Card className="bg-card/90 backdrop-blur-md border-border">
          <Tabs defaultValue="login">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
                <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
              </TabsList>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="admin@synthesis-it.co.uk"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className="bg-background"
                      data-testid="login-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="bg-background pr-10"
                        data-testid="login-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@synthesis-it.co.uk"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="bg-background"
                      data-testid="register-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">Username</Label>
                    <Input
                      id="reg-username"
                      type="text"
                      placeholder="johndoe"
                      value={registerForm.username}
                      onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                      className="bg-background"
                      data-testid="register-username"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className="bg-background"
                      data-testid="register-password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm">Confirm Password</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.confirmPassword}
                      onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                      className="bg-background"
                      data-testid="register-confirm"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading} data-testid="register-submit">
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Synthesis IT Ltd © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
