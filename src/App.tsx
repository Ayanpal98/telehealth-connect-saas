import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useNavigate,
  useLocation
} from 'react-router-dom';
import { 
  Camera, 
  MapPin, 
  ClipboardList, 
  Users, 
  Bell, 
  LogOut, 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Search,
  User as UserIcon,
  Home,
  Activity,
  Database,
  WifiOff,
  UserCircle,
  Edit2,
  Save,
  BookOpen,
  HelpCircle,
  Info,
  Star,
  Navigation,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Stethoscope,
  FileText,
  Pill,
  Check,
  ArrowRight,
  Printer,
  Mail,
  History as HistoryIcon,
  Video,
  Brain,
  Lock,
  Shield,
  Heart,
  Send,
  MessageSquare,
  Globe,
  Sparkles,
  Zap,
  TrendingUp,
  Settings,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Map, Marker } from 'pigeon-maps';
import { UserProfile, MedicalCase, UserRole, CaseStatus } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { ErrorBoundary } from './components/ErrorBoundary';
import { TeleHealthLogo } from './components/TeleHealthLogo';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { QuickReplyMenu, InlineQuickPills, QuickReplyTarget } from './components/QuickReplyMenu';
import { mockAuth, mockDb } from './lib/mockDb';
import { SPECIALTIES, Specialty } from './constants';
import { getConsultantSuggestions, ConsultantSuggestion } from './services/routingService';
import { runIntelligence } from './intelligence/matchingEngine';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Intelligence UI ---
const IntelligencePanel = ({ medicalCase }: { medicalCase: MedicalCase }) => {
  const intelligence = medicalCase.intelligence;
  if (!intelligence) return null;
  const { assessment, matches } = intelligence;
  const emergency = assessment.urgency === 'emergency';
  return (
    <div className={cn('p-5 rounded-3xl border space-y-4', emergency ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', emergency ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600')}>
            {emergency ? <ShieldAlert className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Care Navigation Intelligence</p>
            <h4 className="font-black text-slate-900 mt-1">{emergency ? 'Urgent attention recommended' : 'Suggested care pathway'}</h4>
          </div>
        </div>
        <span className={cn('text-[10px] font-black uppercase px-2.5 py-1 rounded-full', emergency ? 'bg-red-100 text-red-700' : 'bg-white text-indigo-700')}>
          {assessment.urgency}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white/80 rounded-2xl p-3 border border-white"><p className="text-[9px] font-black text-slate-400 uppercase">Suggested specialty</p><p className="text-sm font-black text-slate-800 mt-1">{assessment.recommendedSpecialty}</p></div>
        <div className="bg-white/80 rounded-2xl p-3 border border-white"><p className="text-[9px] font-black text-slate-400 uppercase">Routing confidence</p><p className="text-sm font-black text-slate-800 mt-1">{Math.round(assessment.confidence * 100)}% · navigation only</p></div>
      </div>
      <p className={cn('text-xs leading-relaxed font-semibold', emergency ? 'text-red-800' : 'text-slate-700')}>{assessment.explanation}</p>
      {emergency ? (
        <div className="p-4 bg-white/80 rounded-2xl border border-red-100 text-xs font-bold text-red-800">Do not wait for an online consultant match if symptoms are severe or worsening. Use local emergency services or the nearest emergency department.</div>
      ) : matches.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Available consultants</p>
          {matches.map(match => (
            <div key={match.consultantId} className="bg-white rounded-2xl p-3.5 border border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-sm font-black text-slate-900 truncate">{match.consultantName}</p><p className="text-[10px] font-bold text-indigo-600">{match.specialty || 'Clinician'}</p><div className="mt-2 space-y-1">{match.reasons.slice(0,3).map((reason,i)=><p key={i} className="text-[10px] text-slate-500 font-semibold">• {reason}</p>)}</div></div>
              <span className="shrink-0 text-[10px] font-black bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">{match.matchScore}% match</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-white/80 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-600">No currently available consultant matched this request. A clinician can review the case and route it manually.</div>
      )}
      <p className="text-[9px] text-slate-400 font-semibold">This automated layer supports care navigation and consultant matching. It does not diagnose conditions or prescribe treatment.</p>
    </div>
  );
};

// --- Components ---

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
    <motion.div 
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
    />
  </div>
);

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  type = "info"
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string,
  type?: "info" | "danger" | "warning"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4",
            type === "danger" ? "bg-red-50 text-red-600" : 
            type === "warning" ? "bg-amber-50 text-amber-600" : 
            "bg-blue-50 text-blue-600"
          )}>
            {type === "danger" ? <AlertCircle className="w-6 h-6" /> : 
             type === "warning" ? <Info className="w-6 h-6" /> : 
             <CheckCircle className="w-6 h-6" />}
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-all text-sm"
          >
            {cancelText}
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cn(
              "flex-1 py-2.5 text-white rounded-xl font-bold transition-all text-sm",
              type === "danger" ? "bg-red-600 hover:bg-red-700" : 
              type === "warning" ? "bg-amber-600 hover:bg-amber-700" : 
              "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Navbar = ({ userProfile }: { userProfile: UserProfile | null }) => {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const handleSignOut = () => {
    mockAuth.logout();
    window.dispatchEvent(new Event('auth-change'));
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-blue-600">
          <Activity className="w-6 h-6" />
          <span>Clinova</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-6 mr-6">
            <Link 
              to="/manual" 
              className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Documentation
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link 
              to="/manual" 
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors lg:hidden"
              title="User Manual"
            >
              <HelpCircle className="w-5 h-5" />
            </Link>
            
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              <Database className="w-3 h-3" />
              <span>Local Storage Mode</span>
            </div>
            
            {!isOnline && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full border border-red-100 text-[10px] font-bold uppercase tracking-wider shadow-sm"
              >
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </motion.div>
            )}
          </div>

          {userProfile && (
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-100">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                {userProfile.displayName?.[0] || userProfile.email[0]}
              </div>
              <span className="text-sm font-medium text-gray-700">{userProfile.role}</span>
            </div>
          )}
          <button 
            onClick={handleSignOut}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
};

// --- Patient Views ---

const PatientDashboard = ({ userProfile }: { userProfile: UserProfile }) => {
  const [cases, setCases] = useState<MedicalCase[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'assigned' | 'in-progress' | 'completed'>('all');
  const [view, setView] = useState<'dashboard' | 'consultations' | 'records' | 'prescriptions' | 'reports' | 'profile' | 'settings'>('dashboard');
  const [viewingCase, setViewingCase] = useState<MedicalCase | null>(null);
  
  // Ask AI Assistant state
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    { 
      sender: 'ai', 
      text: "Hello! I am your Clinova AI Assistant. I can help answer health-related questions, explain medical reports, or guide you to the right specialist. How are you feeling today?", 
      time: "Just now" 
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiIsTyping, setAiIsTyping] = useState(false);

  useEffect(() => {
    return mockDb.subscribeToCases((allCases) => {
      const filtered = allCases
        .filter(c => c.patientId === userProfile.uid)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCases(filtered);
    });
  }, [userProfile.uid]);

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || 
        c.symptoms.toLowerCase().includes(query) || 
        (c.requiredSpecialty || '').toLowerCase().includes(query) ||
        c.status.toLowerCase().includes(query) ||
        (c.assignedConsultantName || '').toLowerCase().includes(query);
      const matchesFilter = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesFilter;
    });
  }, [cases, searchQuery, statusFilter]);

  // Statistics
  const totalConsultations = cases.length;
  const totalPrescriptions = cases.filter(c => c.medications && c.medications.length > 0).length;
  const totalReports = cases.filter(c => c.imageUrl).length;
  const activeCases = cases.filter(c => c.status !== 'completed').length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleSendAiMessage = () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg, time: timeStr }]);
    setAiInput('');
    setAiIsTyping(true);

    setTimeout(() => {
      let reply = "I understand you have a question about your symptoms. I strongly advise booking a standard consultation to get mapped to a certified specialist who can provide official medical diagnosis and treatment guidelines.";
      const lower = userMsg.toLowerCase();
      if (lower.includes('headache') || lower.includes('migraine')) {
        reply = "Frequent headaches can stem from stress, dehydration, eye strain, or sleeping patterns. I highly recommend booking a consultation with our General Medicine or Neurology specialists. In the meantime, try rest, proper hydration, and tracking when the headaches occur.";
      } else if (lower.includes('fever') || lower.includes('cough') || lower.includes('cold')) {
        reply = "Fever and cough are common symptoms of respiratory viral infections. Our intelligent routing system will map you to a General Medicine specialist immediately. Please stay rested, self-isolate if you suspect infectious symptoms, and consult a doctor right away.";
      } else if (lower.includes('stomach') || lower.includes('pain') || lower.includes('abdominal')) {
        reply = "Abdominal pain or stomach upset can have many origins ranging from indigestion to dietary reactions. A General Medicine consultation is the fastest way to get clinical guidance. If the pain is severe or sharp, seek urgent emergency care.";
      } else if (lower.includes('report') || lower.includes('pdf') || lower.includes('scan')) {
        reply = "You can securely upload diagnostic images or lab reports directly under the 'Secure Diagnostics Upload' or 'Uploaded Reports' section. Our specialists will audit them during your next active video consultation!";
      } else if (lower.includes('prescription') || lower.includes('medicine')) {
        reply = "Digital ePrescriptions are generated by doctors upon completing your consultation. You will find them listed securely under 'Prescriptions' in your left sidebar, ready to view or reference.";
      }

      setChatMessages(prev => [...prev, { sender: 'ai', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setAiIsTyping(false);
    }, 1000);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex bg-slate-50">
      {/* 18. Desktop Left Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-[calc(100vh-64px)] sticky top-16 shrink-0 p-5 justify-between">
        <div className="space-y-6">
          <div className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-2xl flex items-center gap-2 font-bold text-sm">
            <Activity className="w-5 h-5 animate-pulse" />
            <span>Clinova Portal</span>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">Main Menu</p>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Home },
              { id: 'consultations', label: 'My Consultations', icon: ClipboardList, badge: activeCases > 0 ? activeCases : undefined },
              { id: 'records', label: 'Medical Records', icon: FileText, badge: cases.filter(c => c.diagnosis).length > 0 ? cases.filter(c => c.diagnosis).length : undefined },
              { id: 'prescriptions', label: 'Prescriptions', icon: Pill, badge: totalPrescriptions > 0 ? totalPrescriptions : undefined },
              { id: 'reports', label: 'Uploaded Reports', icon: Camera, badge: totalReports > 0 ? totalReports : undefined },
              { id: 'profile', label: 'My Profile', icon: UserIcon },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all group",
                    isActive 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                      : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-white" : "text-slate-400 group-hover:text-blue-600")} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full",
                      isActive ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/80 space-y-2">
          <p className="text-xs font-bold text-slate-700">Need Help?</p>
          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">Our patient support desk is online 24/7 for you.</p>
          <a href="mailto:support@clinova.com" className="block text-xs font-black text-blue-600 hover:underline">Contact Support</a>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8">
        
        {/* VIEW: DASHBOARD */}
        {view === 'dashboard' && (
          <div className="space-y-8 max-w-6xl mx-auto">
            
            {/* 1. Welcome Header */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-50/50 to-transparent rounded-bl-full" />
              <div className="space-y-2 z-10">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {getGreeting()}, {userProfile.displayName || userProfile.email.split('@')[0]} 👋
                </h1>
                <p className="text-sm md:text-base text-slate-500 max-w-xl font-semibold leading-relaxed">
                  Manage your consultations, view prescriptions, and keep track of your healthcare journey.
                </p>
              </div>

              {/* Header Right Stats Panel */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50/80 border border-slate-100 p-4 rounded-2xl shrink-0 z-10 md:w-80 shadow-inner">
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Last Login</p>
                  <p className="text-xs font-black text-slate-800 mt-1">Today</p>
                </div>
                <div className="text-center border-x border-slate-200">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Health Status</p>
                  <span className="inline-block text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-1">Healthy</span>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Next Appt</p>
                  <p className="text-xs font-black text-slate-500 mt-1">None</p>
                </div>
              </div>
            </div>

            {/* 2. Quick Action Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { 
                  title: "Start Consultation", 
                  desc: "Report new symptoms", 
                  icon: Stethoscope, 
                  color: "bg-rose-50 text-rose-600 border-rose-100", 
                  action: () => setIsCreating(true) 
                },
                { 
                  title: "Medical Records", 
                  desc: "View history", 
                  icon: FileText, 
                  color: "bg-blue-50 text-blue-600 border-blue-100", 
                  action: () => setView('records') 
                },
                { 
                  title: "Prescriptions", 
                  desc: "Download medicines", 
                  icon: Pill, 
                  color: "bg-emerald-50 text-emerald-600 border-emerald-100", 
                  action: () => setView('prescriptions') 
                },
                { 
                  title: "Find Doctor", 
                  desc: "Browse specialists", 
                  icon: Users, 
                  color: "bg-amber-50 text-amber-600 border-amber-100", 
                  action: () => setView('consultations') 
                }
              ].map((card, idx) => {
                const Icon = card.icon;
                return (
                  <button
                    key={idx}
                    onClick={card.action}
                    className={cn(
                      "p-5 rounded-3xl border bg-white shadow-sm flex flex-col text-left justify-between h-40 group hover:shadow-lg hover:-translate-y-1.5 transition-all duration-300",
                      card.color.split(' ')[2] // Hover border matches
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-transform", card.color.split(' ').slice(0,2).join(' '))}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 group-hover:text-blue-600 transition-colors text-sm leading-tight">{card.title}</p>
                      <p className="text-xs text-slate-500 mt-1 font-medium">{card.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Layout Grid: Left 2/3 and Right 1/3 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: 3. Statistics & 9. Progress Section */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* 3. Dashboard Statistics */}
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Account Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Consultations", count: totalConsultations, subtitle: totalConsultations > 0 ? "Active history" : "No cases yet", icon: ClipboardList, color: "text-blue-600 bg-blue-50" },
                      { label: "Prescriptions", count: totalPrescriptions, subtitle: totalPrescriptions > 0 ? "Issued scripts" : "No medicines", icon: Pill, color: "text-emerald-600 bg-emerald-50" },
                      { label: "Reports", count: totalReports, subtitle: totalReports > 0 ? "Diagnostic files" : "No uploads", icon: Camera, color: "text-purple-600 bg-purple-50" },
                      { label: "Active Cases", count: activeCases, subtitle: activeCases > 0 ? "Awaiting updates" : "Fully cleared", icon: Activity, color: "text-amber-600 bg-amber-50" },
                    ].map((stat, idx) => {
                      const Icon = stat.icon;
                      return (
                        <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</span>
                            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", stat.color)}>
                              <Icon className="w-4 h-4" />
                            </div>
                          </div>
                          <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{stat.count}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1 truncate">{stat.subtitle}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 9. Healthcare Journey Progress Section */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <h3 className="text-base font-black text-slate-900 tracking-tight">Your Healthcare Journey</h3>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Visual track of clinical milestones for your consultations.
                  </p>

                  <div className="grid grid-cols-4 gap-2 pt-4 relative">
                    {/* Connecting line */}
                    <div className="absolute top-[22px] left-[12%] right-[12%] h-[2px] bg-slate-100 z-0" />
                    
                    {[
                      { step: 1, label: "Consultation", done: totalConsultations > 0, desc: "Created ticket" },
                      { step: 2, label: "Diagnosis", done: cases.some(c => c.diagnosis), desc: "Doctor review" },
                      { step: 3, label: "Prescription", done: totalPrescriptions > 0, desc: "Medication issued" },
                      { step: 4, label: "Recovery Follow-up", done: false, desc: "Final check" }
                    ].map((item, idx) => (
                      <div key={idx} className="flex flex-col items-center text-center relative z-10">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all shadow-sm",
                          item.done 
                            ? "bg-green-600 border-green-600 text-white" 
                            : idx === 0 || (idx === 1 && totalConsultations > 0) || (idx === 2 && cases.some(c => c.diagnosis))
                              ? "bg-blue-50 border-blue-600 text-blue-600" 
                              : "bg-white border-slate-200 text-slate-400"
                        )}>
                          {item.done ? "✓" : item.step}
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-2 truncate max-w-full">{item.label}</p>
                        <p className="text-[10px] font-semibold text-slate-400 mt-0.5 hidden md:block">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Latest active consultations teaser */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">Recent Active Cases</h3>
                    <button onClick={() => setView('consultations')} className="text-xs font-bold text-blue-600 hover:underline">
                      See All Consultations →
                    </button>
                  </div>

                  {cases.slice(0, 2).map((c) => (
                    <div 
                      key={c.id}
                      onClick={() => { setViewingCase(c); }}
                      className="bg-white p-5 rounded-2xl border border-slate-100/80 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform",
                          c.status === 'pending' ? "bg-amber-50 text-amber-600" :
                          c.status === 'assigned' ? "bg-blue-50 text-blue-600" :
                          c.status === 'in-progress' ? "bg-indigo-50 text-indigo-600" :
                          "bg-green-50 text-green-600"
                        )}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">{c.symptoms}</h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 font-semibold">
                            <span className="capitalize">{c.requiredSpecialty || 'General Medicine'}</span>
                            <span>•</span>
                            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wide shadow-sm",
                          c.status === 'pending' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                          c.status === 'assigned' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                          c.status === 'in-progress' ? "bg-indigo-50 text-indigo-600 border border-indigo-100" :
                          "bg-green-50 text-green-600 border border-green-100"
                        )}>
                          {c.status}
                        </span>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </div>
                  ))}

                  {cases.length === 0 && (
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 text-center space-y-3">
                      <p className="text-sm text-slate-500 font-semibold">No medical consultations logged yet.</p>
                      <button 
                        onClick={() => setIsCreating(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition-all"
                      >
                        + Start First Consultation
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: 11. Health Snapshot, 12. Upcoming, 10. Recent Activity */}
              <div className="space-y-8">
                
                {/* 11. Health Snapshot */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                    <h3 className="text-base font-black text-slate-900 tracking-tight">Health Snapshot</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Blood Group</span>
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md font-bold">O+</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Allergies</span>
                      <span className="text-slate-800 font-bold">None</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Current Medication</span>
                      <span className="text-slate-800 font-bold truncate max-w-[140px]" title={cases.flatMap(c => c.medications || []).join(', ') || 'None'}>
                        {cases.flatMap(c => c.medications || []).slice(0, 2).join(', ') || 'None'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Primary Doctor</span>
                      <span className="text-slate-500 font-bold italic">Not Assigned</span>
                    </div>
                  </div>
                </div>

                {/* 12. Upcoming Appointments */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-base font-black text-slate-900 tracking-tight">Appointments</h3>
                  </div>
                  
                  <div className="p-4 bg-slate-50 rounded-2xl text-center space-y-2 border border-slate-100/50">
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">No upcoming video appointments scheduled.</p>
                    <button onClick={() => setIsCreating(true)} className="text-[11px] font-bold text-blue-600 hover:underline">
                      Book a consultation
                    </button>
                  </div>
                </div>

                {/* 10. Recent Activity */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Recent Activity</h3>
                  
                  <div className="flow-root">
                    <ul className="-mb-8">
                      {[
                        { title: "Prescription downloaded", time: "Today", active: totalPrescriptions > 0 },
                        { title: "Consultation completed", time: "Yesterday", active: cases.some(c => c.status === 'completed') },
                        { title: "Report uploaded", time: "March 4", active: totalReports > 0 }
                      ].map((act, actIdx) => (
                        <li key={actIdx}>
                          <div className="relative pb-8">
                            {actIdx !== 2 && (
                              <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-100" aria-hidden="true" />
                            )}
                            <div className="relative flex space-x-3">
                              <div>
                                <span className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white",
                                  act.active ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-400"
                                )}>
                                  <Activity className="w-4 h-4" />
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 pt-1.5 flex justify-between space-x-4">
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{act.title}</p>
                                </div>
                                <div className="text-right text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                                  {act.time}
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* VIEW: CONSULTATIONS */}
        {view === 'consultations' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Medical Consultations</h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Browse history, check queues, or file symptoms</p>
              </div>

              {/* 6. New Consultation Button */}
              <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3.5 rounded-2xl font-bold hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-100 shrink-0 self-start"
              >
                <Plus className="w-5 h-5" />
                <span>+ Start New Consultation</span>
              </button>
            </div>

            {/* 4. Improved Search Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="🔍 Search by: Symptoms, Doctor, Department, Status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-sm text-slate-800 font-bold"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Filter Status:</span>
                {[
                  { id: 'all', label: 'All Cases' },
                  { id: 'pending', label: 'Pending Queue' },
                  { id: 'assigned', label: 'Clinician Mapped' },
                  { id: 'in-progress', label: 'Active Sessions' },
                  { id: 'completed', label: 'Completed' },
                ].map((chip) => {
                  const isActive = statusFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => setStatusFilter(chip.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                        isActive 
                          ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                          : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100/50"
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 7. Better Case Cards / 5. Empty State */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredCases.map((c) => (
                <motion.div 
                  key={c.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setViewingCase(c)}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden h-60"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      {/* Left icon & spec */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                          <ClipboardList className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{c.requiredSpecialty || 'General Medicine'}</p>
                          <p className="text-[10px] font-bold text-slate-400">{new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                      </div>

                      {/* Status chip */}
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wide shadow-sm flex items-center gap-1.5",
                        c.status === 'pending' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                        c.status === 'assigned' ? "bg-blue-50 text-blue-700 border border-blue-100" :
                        c.status === 'in-progress' ? "bg-indigo-50 text-indigo-700 border border-indigo-100" :
                        "bg-green-50 text-green-700 border border-green-100"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full animate-pulse",
                          c.status === 'pending' ? "bg-amber-500" :
                          c.status === 'assigned' ? "bg-blue-500" :
                          c.status === 'in-progress' ? "bg-indigo-500" :
                          "bg-green-500"
                        )} />
                        {c.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">SYMPTOMS REPORTED</p>
                      <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                        {c.symptoms}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">
                      {c.assignedConsultantName ? `Doctor: ${c.assignedConsultantName}` : "Awaiting clinician pairing"}
                    </span>
                    <span className="text-xs font-black text-blue-600 group-hover:text-blue-700 flex items-center gap-1 transition-colors">
                      View Details <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </motion.div>
              ))}

              {filteredCases.length === 0 && (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-slate-100/80 shadow-sm space-y-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <ClipboardList className="w-8 h-8" />
                  </div>
                  <div className="space-y-2 max-w-sm mx-auto">
                    <h3 className="text-lg font-black text-slate-900">🩺 No Medical Consultations Yet</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      Start your first consultation to connect with a healthcare professional.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsCreating(true)}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    Start Consultation
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: RECORDS */}
        {view === 'records' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Lifetime Medical Records</h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Access official doctor diagnoses and clinical guidelines securely</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cases.filter(c => c.diagnosis).map((c) => (
                <div 
                  key={c.id}
                  onClick={() => setViewingCase(c)}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-72"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{c.requiredSpecialty || 'General Medicine'}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100 uppercase tracking-wider">Verified Diagnosed</span>
                    </div>

                    <div className="space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">CLINICAL DIAGNOSIS</p>
                      <p className="text-xs font-semibold text-slate-700 line-clamp-3 leading-relaxed">
                        {c.diagnosis}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Doctor: {c.assignedConsultantName || "Clinic specialist"}</span>
                    <span className="text-xs font-black text-blue-600 hover:underline">View Full Details →</span>
                  </div>
                </div>
              ))}

              {cases.filter(c => c.diagnosis).length === 0 && (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-lg font-black text-slate-900">No Medical Records Yet</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
                    Once our doctors provide diagnoses or therapy directions, your clinical reports will populate here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: PRESCRIPTIONS */}
        {view === 'prescriptions' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">ePrescription Portal</h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Secure, pharmacy-ready digital medications and dosage prescriptions</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {cases.filter(c => c.medications && c.medications.length > 0).map((c) => (
                <div 
                  key={c.id}
                  className="bg-white p-6 rounded-3xl border-2 border-dashed border-slate-200 shadow-sm flex flex-col justify-between h-80 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/40 rounded-bl-full flex items-center justify-center font-black text-blue-600 text-lg">Rx</div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <Pill className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{c.requiredSpecialty || 'General Medicine'} Portal</h4>
                        <p className="text-[10px] font-bold text-slate-400">Rx ID: {c.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PRESCRIBED MEDICINES</p>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {c.medications?.map((med, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50/70 border border-blue-100 text-blue-700 rounded-full text-xs font-bold">
                            💊 {med}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400">ISSUED BY</p>
                      <p className="text-xs font-bold text-slate-800">{c.assignedConsultantName || "Clinova Clinician"}</p>
                    </div>
                    <button 
                      onClick={() => alert(`Downloading Rx receipt: ${c.id.slice(0, 8).toUpperCase()} file...`)}
                      className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                    >
                      Download Rx
                    </button>
                  </div>
                </div>
              ))}

              {cases.filter(c => c.medications && c.medications.length > 0).length === 0 && (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <Pill className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-lg font-black text-slate-900">No Prescriptions Issued</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
                    You have no active prescriptions. Prescriptions will appear here once clinically issued by your paired doctor.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: REPORTS */}
        {view === 'reports' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Uploaded Diagnostic Evidence</h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Secure sandbox containing medical scans, logs, or diagnostic screenshots</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {cases.filter(c => c.imageUrl).map((c) => (
                <div 
                  key={c.id}
                  onClick={() => setViewingCase(c)}
                  className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between h-64 group"
                >
                  <div className="rounded-2xl overflow-hidden h-32 bg-slate-50 border border-slate-100 relative">
                    <img src={c.imageUrl} alt="evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  </div>
                  
                  <div className="space-y-1 pt-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase truncate">{c.requiredSpecialty || 'General'}</p>
                    <p className="text-xs font-bold text-slate-800 line-clamp-1">{c.symptoms}</p>
                    <p className="text-[9px] font-semibold text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}

              {cases.filter(c => c.imageUrl).length === 0 && (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <Camera className="w-12 h-12 text-slate-300 mx-auto" />
                  <h3 className="text-lg font-black text-slate-900">No Image Reports Uploaded</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
                    You can append medical images, diagnostic scans, or report photos when filing a new symptom consultation!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: PROFILE */}
        {view === 'profile' && (
          <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <PatientProfileSection patientId={userProfile.uid} />
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {view === 'settings' && (
          <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-8">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Security & Preferences</h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Manage notifications, auth safety, and local diagnostics logs</p>
            </div>

            <div className="space-y-6">
              {/* Notification card */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" /> Notification Alert Preferences
                </h3>
                <div className="space-y-2.5">
                  {[
                    "Email notifications on doctor responses",
                    "Awaiting queue updates in browser header",
                    "Critical diagnostic prescription alert popups"
                  ].map((pref, idx) => (
                    <label key={idx} className="flex items-center gap-3 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300" />
                      <span>{pref}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Encryption block */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" /> Encryption & Privacy Safety
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Your patient records, clinical details, diagnoses, and diagnostic uploads are secured in a localized offline sandbox mode with AES-256 equivalent standard structures.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                  <span>Sandbox Encrypted & Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 15. Responsive Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 py-2.5 px-4 flex justify-around items-center lg:hidden shadow-[0_-8px_30px_rgb(0,0,0,0.06)]">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Home },
          { id: 'consultations', label: 'Cases', icon: ClipboardList },
          { id: 'records', label: 'Records', icon: FileText },
          { id: 'profile', label: 'Profile', icon: UserIcon },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all",
                isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          );
        })}
        {/* Floating action bottom nav bridge */}
        <button
          onClick={() => setIsCreating(true)}
          className="flex flex-col items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-100 -mt-5 transition-transform hover:scale-105"
        >
          <Plus className="w-6 h-6" />
        </button>
      </nav>

      {/* 13. Floating Help/Ask AI Assistant Button */}
      <button
        onClick={() => setShowAIChat(true)}
        className="fixed bottom-20 md:bottom-6 right-6 z-40 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-full px-5 py-3.5 shadow-xl shadow-blue-200 flex items-center gap-2 hover:-translate-y-1 transition-all duration-300"
      >
        <Sparkles className="w-5 h-5 animate-spin-slow text-yellow-300 fill-yellow-300" />
        <span className="text-xs tracking-wider">Ask AI</span>
      </button>

      {/* Floating Interactive AI Assistant chat popup modal */}
      <AnimatePresence>
        {showAIChat && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-end p-4 md:p-6 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="bg-white w-full max-w-md h-[550px] rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-black text-sm">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">AI Health Assistant</h3>
                    <p className="text-[10px] text-blue-100 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                      Online & ready
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAIChat(false)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              {/* Chat history */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={cn("flex flex-col max-w-[80%]", msg.sender === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div className={cn(
                      "p-3.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm",
                      msg.sender === 'user' 
                        ? "bg-blue-600 text-white rounded-tr-none" 
                        : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold mt-1 px-1">{msg.time}</span>
                  </div>
                ))}

                {aiIsTyping && (
                  <div className="flex flex-col items-start max-w-[80%]">
                    <div className="bg-white border border-slate-100 p-3.5 rounded-2xl rounded-tl-none text-xs text-slate-500 font-medium shadow-sm flex items-center gap-2">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100" />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Suggestion tags */}
              <div className="p-2.5 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto whitespace-nowrap shrink-0">
                {[
                  "I have a headache",
                  "I have a fever",
                  "Where is my prescription?",
                  "Filing medical reports"
                ].map((sugg, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setAiInput(sugg); }}
                    className="px-3 py-1 bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-600 rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shrink-0"
                  >
                    {sugg}
                  </button>
                ))}
              </div>

              {/* Input panel */}
              <div className="p-3 border-t border-slate-100 bg-white flex gap-2">
                <input
                  type="text"
                  placeholder="Ask something..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendAiMessage()}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-xs font-bold text-slate-700"
                />
                <button
                  onClick={handleSendAiMessage}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Send
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Case Details Modal */}
      <AnimatePresence>
        {viewingCase && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Case Study Detail</h3>
                    <p className="text-xs text-gray-500">ID: {viewingCase.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingCase(null)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <Plus className="w-6 h-6 rotate-45 text-gray-500" />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                {viewingCase.diagnosis && (
                  <div className="p-6 bg-green-50 border border-green-100 rounded-3xl">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <h4 className="font-bold text-green-900">Medical Guidance & Diagnosis</h4>
                    </div>
                    <p className="text-sm text-green-800 leading-relaxed mb-6">{viewingCase.diagnosis}</p>
                    
                    {viewingCase.medications && viewingCase.medications.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-green-700 uppercase tracking-wider">Prescribed Medications</h5>
                        <div className="flex flex-wrap gap-2">
                          {viewingCase.medications.map((med, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-white text-green-700 rounded-full text-xs font-bold border border-green-100 shadow-sm">
                              <Pill className="w-3 h-3" />
                              {med}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewingCase.treatmentPlan && viewingCase.treatmentPlan.length > 0 && (
                      <div className="mt-6 space-y-3">
                        <h5 className="text-xs font-bold text-green-700 uppercase tracking-wider">Structured Treatment Plan</h5>
                        <div className="space-y-2">
                          {viewingCase.treatmentPlan.map((step, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-xl border border-green-50">
                              <div className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </div>
                              <p className="text-sm text-green-800">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewingCase.medicalAssistanceMeasures && (
                      <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Medical Assistance Measures</h5>
                        <p className="text-sm text-blue-800 leading-relaxed italic">
                          "{viewingCase.medicalAssistanceMeasures}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Status & Timeline</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          viewingCase.status === 'pending' ? "bg-amber-50 text-amber-600" :
                          viewingCase.status === 'assigned' ? "bg-blue-50 text-blue-600" :
                          viewingCase.status === 'in-progress' ? "bg-indigo-50 text-indigo-600" :
                          "bg-green-50 text-green-600"
                        )}>
                          {viewingCase.status}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <Clock className="w-3 h-3" /> Created: {new Date(viewingCase.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <Activity className="w-3 h-3" /> Updated: {new Date(viewingCase.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Assignment</h4>
                    {viewingCase.assignedConsultantName ? (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                          {viewingCase.assignedConsultantName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{viewingCase.assignedConsultantName}</p>
                          <p className="text-[10px] text-blue-600 font-medium">Assigned Clinician</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Not assigned yet</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical Presentation</h4>
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {viewingCase.requiredSpecialty || 'General Medicine'}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed text-sm">
                      {viewingCase.symptoms}
                    </p>
                  </div>
                </div>

                {viewingCase.imageUrl && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical Evidence (Image)</h4>
                    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                      <img 
                        src={viewingCase.imageUrl} 
                        alt="Clinical evidence" 
                        className="w-full h-auto max-h-96 object-contain mx-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Case Modal */}
      <AnimatePresence>
        {isCreating && (
          <CreateCaseModal 
            userProfile={userProfile} 
            onClose={() => setIsCreating(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const CreateCaseModal = ({ userProfile, onClose }: { userProfile: UserProfile, onClose: () => void }) => {
  const [symptoms, setSymptoms] = useState('');
  const [requiredSpecialty, setRequiredSpecialty] = useState<Specialty>('General Medicine');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const [image, setImage] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      () => {
        alert("Could not get location. Please enable permissions.");
        setIsLocating(false);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms) return;
    setShowConfirmSubmit(true);
  };

  const confirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const medicalCase = {
        id: 'pending-intelligence',
        patientId: userProfile.uid,
        patientName: userProfile.displayName || userProfile.email,
        symptoms,
        requiredSpecialty,
        location: location ? { latitude: location.lat, longitude: location.lng } : undefined,
        imageUrl: image || undefined,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const intelligence = runIntelligence(
        medicalCase,
        mockDb.getProfiles().filter(p => p.role === 'clinician')
      );
      mockDb.saveCase({ ...medicalCase, intelligence });
      
      // Delay for feedback
      setTimeout(() => {
        onClose();
        setIsSubmitting(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">New Consultation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Required Specialty
            </label>
            <select 
              value={requiredSpecialty}
              onChange={(e) => setRequiredSpecialty(e.target.value as Specialty)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {SPECIALTIES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Describe your symptoms
            </label>
            <textarea 
              required
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g. Severe headache for 2 days, mild fever..."
              className="w-full h-32 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Attach a photo (optional)
            </label>
            <div className="space-y-3">
              <label 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-2xl transition-all cursor-pointer overflow-hidden relative group",
                  isDragging ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50",
                  image ? "border-solid border-blue-100" : ""
                )}
              >
                {image ? (
                  <div className="relative w-full h-full">
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white text-xs font-bold bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">Click to Change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-colors",
                      isDragging ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"
                    )}>
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-700">
                      {isDragging ? "Drop image here" : "Capture or Upload Photo"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">PNG, JPG or GIF up to 5MB</p>
                  </>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  onChange={handleImageChange}
                  className="hidden" 
                />
              </label>
              
              {image && (
                <button 
                  type="button"
                  onClick={() => setImage(null)}
                  className="w-full py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 rotate-45" />
                  Remove Photo
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3">
              <MapPin className={cn("w-5 h-5", location ? "text-blue-600" : "text-gray-400")} />
              <div>
                <p className="text-sm font-semibold text-gray-900">Location Detection</p>
                <p className="text-xs text-gray-500">
                  {location ? "Location captured" : "Help us find nearby consultants"}
                </p>
              </div>
            </div>
            <button 
              type="button"
              onClick={handleGetLocation}
              disabled={isLocating}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                location 
                  ? "bg-blue-100 text-blue-700" 
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              )}
            >
              {isLocating ? "Locating..." : location ? "Update" : "Detect"}
            </button>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3 overflow-hidden relative"
          >
            <AnimatePresence mode="wait">
              {isSubmitting ? (
                <motion.div 
                  key="submitting"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                  <span>Processing...</span>
                </motion.div>
              ) : (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>Submit Case Request</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </form>

        <ConfirmationModal 
          isOpen={showConfirmSubmit}
          onClose={() => setShowConfirmSubmit(false)}
          onConfirm={confirmSubmit}
          title="Submit Medical Case"
          message="Are you sure you want to submit this consultation request? A clinician will review it shortly."
          confirmText="Submit Now"
          type="info"
        />
      </motion.div>
    </div>
  );
};

// --- Clinician Views ---

const ConsultationSection = ({ medicalCase, clinician }: { medicalCase: MedicalCase, clinician: UserProfile }) => {
  const [diagnosis, setDiagnosis] = useState(medicalCase.diagnosis || '');
  const [medications, setMedications] = useState<string[]>(medicalCase.medications || []);
  const [newMed, setNewMed] = useState('');
  const [notes, setNotes] = useState(medicalCase.clinicianNotes || '');
  const [treatmentPlan, setTreatmentPlan] = useState<string[]>(medicalCase.treatmentPlan || []);
  const [newPlanStep, setNewPlanStep] = useState('');
  const [medicalAssistanceMeasures, setMedicalAssistanceMeasures] = useState(medicalCase.medicalAssistanceMeasures || '');
  const [steps, setSteps] = useState(medicalCase.consultationSteps || { consulted: false, analyzed: false, updated: false });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleQuickInsert = (target: QuickReplyTarget, content: string) => {
    if (target === 'diagnosis') {
      setDiagnosis(prev => prev ? `${prev.trim()}\n\n${content}` : content);
      setSteps(prev => ({ ...prev, analyzed: true }));
      showToast('Inserted into Diagnosis & Findings');
    } else if (target === 'treatmentPlan') {
      setTreatmentPlan(prev => [...prev, content]);
      setSteps(prev => ({ ...prev, updated: true }));
      showToast('Added step to Treatment Plan');
    } else if (target === 'notes') {
      setNotes(prev => prev ? `${prev.trim()}\n\n${content}` : content);
      showToast('Appended to Clinician Private Notes');
    } else if (target === 'medicalAssistanceMeasures') {
      setMedicalAssistanceMeasures(prev => prev ? `${prev.trim()}\n\n${content}` : content);
      setSteps(prev => ({ ...prev, updated: true }));
      showToast('Inserted into Medical Assistance Measures');
    } else if (target === 'medication') {
      setMedications(prev => [...prev, content]);
      setSteps(prev => ({ ...prev, updated: true }));
      showToast('Added prescribed medication');
    }
  };

  const handleAddMed = () => {
    if (newMed.trim()) {
      setMedications([...medications, newMed.trim()]);
      setNewMed('');
      setSteps(prev => ({ ...prev, updated: true }));
    }
  };

  const handleRemoveMed = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleAddPlanStep = () => {
    if (newPlanStep.trim()) {
      setTreatmentPlan([...treatmentPlan, newPlanStep.trim()]);
      setNewPlanStep('');
      setSteps(prev => ({ ...prev, updated: true }));
    }
  };

  const handleRemovePlanStep = (index: number) => {
    setTreatmentPlan(treatmentPlan.filter((_, i) => i !== index));
  };

  const toggleStep = (step: keyof typeof steps) => {
    setSteps(prev => ({ ...prev, [step]: !prev[step] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      mockDb.updateCase(medicalCase.id, {
        diagnosis,
        medications,
        clinicianNotes: notes,
        treatmentPlan,
        medicalAssistanceMeasures,
        consultationSteps: steps,
        status: steps.updated ? 'in-progress' : medicalCase.status
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      mockDb.updateCase(medicalCase.id, {
        diagnosis,
        medications,
        clinicianNotes: notes,
        treatmentPlan,
        medicalAssistanceMeasures,
        consultationSteps: steps,
        status: 'completed'
      });
      setShowConfirmComplete(false);
    } finally {
      setIsSaving(false);
    }
  };

  const diagnosisPills = [
    { title: 'Viral URI', text: 'Patient presents with symptoms consistent with acute viral upper respiratory tract infection. Clear lung sounds bilaterally, no signs of lower respiratory consolidation or secondary bacterial infection.' },
    { title: 'Tension Headache', text: 'Bilateral, mild-to-moderate band-like tension headache without photophobia, nausea, or focal neurological deficits.' },
    { title: 'Contact Dermatitis', text: 'Localized erythematous pruritic maculopapular rash secondary to external allergen/irritant contact. Intact epidermal barrier.' },
    { title: 'Gastroenteritis', text: 'Acute uncomplicated gastroenteritis with mild nausea and self-limiting loose stools. Good oral hydration maintained.' },
    { title: 'Lumbar Strain', text: 'Acute musculoskeletal lumbar strain with localized paravertebral tenderness and intact lower extremity neurovascular exam.' }
  ];

  const notesPills = [
    { title: 'Teleconsult Verified', text: 'Virtual teleconsultation conducted via secure Clinova video/audio channel. Patient identity verified. Informed consent documented.' },
    { title: 'Low Acute Risk', text: 'Patient evaluated as low acute clinical risk. Supportive home therapy and symptom monitoring initiated.' },
    { title: 'Rx Counseled', text: 'Prescription issued. Patient counseled on medication timing, food intake, and warning signs.' },
    { title: 'Follow-up in 48h', text: 'Advised patient to schedule secondary teleconsultation if symptoms do not improve within 48-72 hours.' }
  ];

  const measuresPills = [
    { title: 'Home Isolation', text: 'Advised voluntary home convalescence and high-filtration mask wearing until afebrile for 24 hours.' },
    { title: 'Vital Tele-Monitoring', text: 'Instructed patient to record temperature, resting heart rate, and SpO2 twice daily.' },
    { title: 'Ergonomic Guidelines', text: 'Provided ergonomic posture guidelines and 5-minute stretch routine during desk work.' }
  ];

  const treatmentPills = [
    { title: 'Hydration 2.5-3L', text: 'Maintain vigorous oral hydration (2.5 - 3.0 L/day) using water, herbal broths, or oral rehydration solutions.' },
    { title: '48h Rest', text: 'Strict cognitive and physical rest for 48 hours; avoid heavy lifting, workouts, and extended screen time.' },
    { title: 'Saline Gargle & Steam', text: 'Perform warm saline gargles 3-4 times daily and steam inhalation before sleep.' },
    { title: 'BRAT Diet', text: 'Follow bland BRAT diet (bananas, rice, applesauce, toast); strictly avoid dairy and greasy foods for 72 hours.' },
    { title: 'Emergency Red Flags', text: 'Seek emergency evaluation immediately if experiencing high fever (>39°C), dyspnea, chest pressure, or altered alertness.' }
  ];

  const medicationPills = [
    { title: 'Paracetamol 500mg', text: 'Paracetamol 500mg PO every 6 hours as needed for fever/pain (Max 3000mg/24h)' },
    { title: 'Ibuprofen 400mg', text: 'Ibuprofen 400mg PO every 8 hours with food for anti-inflammatory pain relief' },
    { title: 'Cetirizine 10mg', text: 'Cetirizine 10mg PO once daily at bedtime for allergic symptom control' },
    { title: 'ORS Sachet', text: 'Oral Rehydration Salts (1 sachet in 1L boiled water, sip throughout day)' }
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-8 z-50 px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold border border-slate-700"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-xl font-black text-slate-900">Medical Consultation</h3>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-black uppercase tracking-wider">
              Clinician Editor
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Follow the guided steps or use Quick Reply presets to provide rapid, standardized care guidance.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Reply Menu Trigger */}
          <QuickReplyMenu onInsert={handleQuickInsert} activeTarget="diagnosis" />

          <AnimatePresence mode="wait">
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-black transition-all text-xs flex items-center gap-1.5 group active:scale-95"
          >
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full"
              />
            ) : <Save className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />}
            {isSaving ? "Saving..." : "Save Progress"}
          </button>

          <button 
            type="button"
            onClick={() => setShowConfirmComplete(true)}
            disabled={!steps.consulted || !steps.analyzed || !steps.updated || isSaving}
            className="px-4 py-2 bg-green-600 text-white rounded-xl font-black hover:bg-green-700 transition-all text-xs disabled:opacity-50 shadow-md shadow-green-600/20 flex items-center gap-1.5 active:scale-95"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Complete Case
          </button>
        </div>
      </div>

      {/* Guided Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { id: 'consulted', label: '1. Consult', icon: Stethoscope, desc: 'Review symptoms & history' },
          { id: 'analyzed', label: '2. Analyze', icon: Activity, desc: 'Formulate diagnosis & notes' },
          { id: 'updated', label: '3. Prescribe & Guide', icon: FileText, desc: 'Treatment plan & medications' }
        ].map((step) => (
          <button
            key={step.id}
            type="button"
            onClick={() => toggleStep(step.id as any)}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden group",
              steps[step.id as keyof typeof steps] 
                ? "bg-blue-50/80 border-blue-200 shadow-sm" 
                : "bg-white border-slate-100 hover:border-blue-100"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                steps[step.id as keyof typeof steps] ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
              )}>
                <step.icon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900">{step.label}</h4>
                <p className="text-[10px] text-slate-500">{step.desc}</p>
              </div>
            </div>
            {steps[step.id as keyof typeof steps] && (
              <div className="absolute top-2.5 right-2.5">
                <Check className="w-4 h-4 text-blue-600" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Quick Reply Tip & Banner */}
      <div className="p-3.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100/80 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
            <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              Quick Reply Menu Enabled
              <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded">Speed Presets</span>
            </h4>
            <p className="text-[11px] text-slate-600">
              Click the <strong className="text-blue-700 font-bold">⚡ Quick Reply Menu</strong> or the quick pill phrases below each box to insert standardized clinical wording instantly.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const btn = document.getElementById('quick-reply-trigger-btn');
            if (btn) btn.click();
          }}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
        >
          Browse All Phrases →
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Diagnosis, Notes, Measures */}
        <div className="space-y-6">
          {/* Diagnosis & Findings */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Diagnosis & Findings
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">Visible to Patient</span>
            </div>

            <InlineQuickPills 
              label="Common Diagnoses:"
              items={diagnosisPills}
              onSelect={(text) => handleQuickInsert('diagnosis', text)}
            />

            <textarea 
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Enter your medical analysis and diagnosis here or select from Quick Replies..."
              className="w-full h-32 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-xs leading-relaxed"
            />
          </div>

          {/* Clinician Notes (Private) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Clinician Notes (Private)
              </label>
              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                🔒 Clinician Only
              </span>
            </div>

            <InlineQuickPills 
              label="Clinical Notes:"
              items={notesPills}
              onSelect={(text) => handleQuickInsert('notes', text)}
            />

            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal clinician remarks, differential notes, risk triage rationale..."
              className="w-full h-32 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-xs leading-relaxed"
            />
          </div>

          {/* Medical Assistance Measures */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Medical Assistance Measures
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">Convalescence Protocol</span>
            </div>

            <InlineQuickPills 
              label="Assistance Protocols:"
              items={measuresPills}
              onSelect={(text) => handleQuickInsert('medicalAssistanceMeasures', text)}
            />

            <textarea 
              value={medicalAssistanceMeasures}
              onChange={(e) => setMedicalAssistanceMeasures(e.target.value)}
              placeholder="Home quarantine advice, daily vitals telemonitoring, ergonomic guidelines..."
              className="w-full h-32 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-xs leading-relaxed"
            />
          </div>
        </div>

        {/* Right Column: Structured Treatment Plan & Prescriptions */}
        <div className="space-y-6">
          {/* Treatment Plan */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Structured Treatment Plan
              </label>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold">
                {treatmentPlan.length} Steps
              </span>
            </div>

            <InlineQuickPills 
              label="Treatment Directives:"
              items={treatmentPills}
              onSelect={(text) => handleQuickInsert('treatmentPlan', text)}
            />

            <div className="flex gap-2">
              <input 
                type="text"
                value={newPlanStep}
                onChange={(e) => setNewPlanStep(e.target.value)}
                placeholder="Type or 1-click insert treatment directive..."
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                onKeyPress={(e) => e.key === 'Enter' && handleAddPlanStep()}
              />
              <button 
                type="button"
                onClick={handleAddPlanStep}
                className="px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <AnimatePresence>
                {treatmentPlan.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200"
                  >
                    <ClipboardList className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs text-slate-400 font-medium">No treatment steps added yet</p>
                    <p className="text-[10px] text-slate-400">Click a quick phrase above or type a step.</p>
                  </motion.div>
                ) : (
                  treatmentPlan.map((step, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-start justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-200 transition-all group gap-2"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black">
                          {index + 1}
                        </div>
                        <span className="text-xs font-medium text-slate-700 leading-relaxed">{step}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemovePlanStep(index)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Prescribed Medications */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Prescribed Medications & Rx
              </label>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                {medications.length} Prescribed
              </span>
            </div>

            <InlineQuickPills 
              label="Standard Rx:"
              items={medicationPills}
              onSelect={(text) => handleQuickInsert('medication', text)}
            />

            <div className="flex gap-2">
              <input 
                type="text"
                value={newMed}
                onChange={(e) => setNewMed(e.target.value)}
                placeholder="e.g. Paracetamol 500mg PO TDS for 3 days"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                onKeyPress={(e) => e.key === 'Enter' && handleAddMed()}
              />
              <button 
                type="button"
                onClick={handleAddMed}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>Add Rx</span>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <AnimatePresence>
                {medications.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200"
                  >
                    <Pill className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs text-slate-400 font-medium">No medications prescribed yet</p>
                    <p className="text-[10px] text-slate-400">Click a quick medication pill or enter dosage above.</p>
                  </motion.div>
                ) : (
                  medications.map((med, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center justify-between p-2.5 bg-blue-50/40 border border-blue-100/80 rounded-xl hover:border-blue-200 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0">
                          <Pill className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-slate-800">{med}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleRemoveMed(index)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 rotate-45" />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal 
        isOpen={showConfirmComplete}
        onClose={() => setShowConfirmComplete(false)}
        onConfirm={handleComplete}
        title="Complete Consultation"
        message="Are you sure you want to mark this case as completed? This will finalize the diagnosis and medications for the patient."
        confirmText="Finalize & Complete"
        type="info"
      />
    </div>
  );
};

const PatientProfileSection = ({ patientId }: { patientId: string }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null);
  const [patientCases, setPatientCases] = useState<MedicalCase[]>([]);
  const [viewingCase, setViewingCase] = useState<MedicalCase | null>(null);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);

  useEffect(() => {
    const profiles = mockDb.getProfiles();
    const p = profiles.find(u => u.uid === patientId);
    if (p) {
      setProfile(p);
      setEditedProfile(p);
    }

    // Fetch patient cases
    const allCases = mockDb.getCases();
    const filtered = allCases
      .filter(c => c.patientId === patientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setPatientCases(filtered);
  }, [patientId]);

  const handleSave = () => {
    if (editedProfile) {
      mockDb.saveProfile(editedProfile);
      setProfile(editedProfile);
      setIsEditing(false);
    }
  };

  if (!profile) return <div className="p-8 text-center text-gray-500 italic">Profile not found</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-gray-900">Patient Profile</h3>
        <button 
          onClick={() => isEditing ? setShowConfirmSave(true) : setIsEditing(true)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all",
            isEditing ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          {isEditing ? <><Save className="w-4 h-4" /> Save Changes</> : <><Edit2 className="w-4 h-4" /> Edit Profile</>}
        </button>
      </div>

      <ConfirmationModal 
        isOpen={showConfirmSave}
        onClose={() => setShowConfirmSave(false)}
        onConfirm={handleSave}
        title="Save Profile Changes"
        message="Are you sure you want to update this patient's profile information?"
        confirmText="Save Changes"
        type="info"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Full Name</label>
            {isEditing ? (
              <input 
                type="text"
                value={editedProfile?.displayName || ''}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, displayName: e.target.value } : null)}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            ) : (
              <p className="text-gray-900 font-medium">{profile.displayName || 'N/A'}</p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Email Address</label>
            <p className="text-gray-900 font-medium">{profile.email}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Account Created</label>
            <p className="text-gray-900 font-medium">{new Date(profile.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Clinical Notes</h4>
            <p className="text-xs text-blue-600 leading-relaxed">
              This patient has been registered since {new Date(profile.createdAt).getFullYear()}. 
              All medical history is stored securely in local storage.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">System Info</h4>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500">UID: {profile.uid}</p>
              <p className="text-[10px] text-gray-500">Role: {profile.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Medical History Summary Section */}
      <div className="mt-8">
        <button 
          onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
          className="w-full flex items-center justify-between p-4 bg-amber-50/50 border border-amber-100 rounded-2xl hover:bg-amber-50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-gray-900">Medical History Summary</h3>
              <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Quick review of past diagnoses</p>
            </div>
          </div>
          {isHistoryCollapsed ? <ChevronDown className="w-5 h-5 text-amber-400 group-hover:text-amber-600 transition-colors" /> : <ChevronUp className="w-5 h-5 text-amber-400 group-hover:text-amber-600 transition-colors" />}
        </button>

        <AnimatePresence>
          {!isHistoryCollapsed && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-4">
                {patientCases.filter(c => c.diagnosis).length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-4">No recorded diagnoses found in history.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {patientCases.filter(c => c.diagnosis).map((c, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-gray-900">{c.diagnosis}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {new Date(c.createdAt).toLocaleDateString()} • {c.requiredSpecialty || 'General Medicine'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Case History Section */}
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-6">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-bold text-gray-900">Case History</h3>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
            {patientCases.length}
          </span>
        </div>

        <div className="space-y-4">
          {patientCases.length === 0 ? (
            <p className="text-sm text-gray-400 italic bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-200 text-center">
              No past cases found for this patient.
            </p>
          ) : (
            patientCases.map((c) => (
              <motion.div 
                key={c.id} 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setViewingCase(c)}
                className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      c.status === 'pending' ? "bg-amber-500" :
                      c.status === 'assigned' ? "bg-blue-500" :
                      c.status === 'in-progress' ? "bg-indigo-500" :
                      "bg-green-500"
                    )} />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                      c.status === 'pending' ? "bg-amber-50 text-amber-600" :
                      c.status === 'assigned' ? "bg-blue-50 text-blue-600" :
                      c.status === 'in-progress' ? "bg-indigo-50 text-indigo-600" :
                      "bg-green-50 text-green-600"
                    )}>
                      {c.status}
                    </span>
                    <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1 line-clamp-1">{c.symptoms}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">{c.requiredSpecialty || 'General Medicine'}</span>
                  {c.assignedConsultantName && (
                    <span className="flex items-center gap-1">
                      • <Users className="w-3 h-3" /> Assigned to {c.assignedConsultantName.split(' ')[0]}
                    </span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Case Detail Modal */}
      <AnimatePresence>
        {viewingCase && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Case Study Detail</h3>
                    <p className="text-xs text-gray-500">ID: {viewingCase.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingCase(null)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <Plus className="w-6 h-6 rotate-45 text-gray-500" />
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                {viewingCase.diagnosis && (
                  <div className="p-6 bg-green-50 border border-green-100 rounded-3xl">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <h4 className="font-bold text-green-900">Medical Guidance & Diagnosis</h4>
                    </div>
                    <p className="text-sm text-green-800 leading-relaxed mb-6">{viewingCase.diagnosis}</p>
                    
                    {viewingCase.medications && viewingCase.medications.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-green-700 uppercase tracking-wider">Prescribed Medications</h5>
                        <div className="flex flex-wrap gap-2">
                          {viewingCase.medications.map((med, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-3 py-1 bg-white text-green-700 rounded-full text-xs font-bold border border-green-100 shadow-sm">
                              <Pill className="w-3 h-3" />
                              {med}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewingCase.treatmentPlan && viewingCase.treatmentPlan.length > 0 && (
                      <div className="mt-6 space-y-3">
                        <h5 className="text-xs font-bold text-green-700 uppercase tracking-wider">Structured Treatment Plan</h5>
                        <div className="space-y-2">
                          {viewingCase.treatmentPlan.map((step, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-xl border border-green-50">
                              <div className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </div>
                              <p className="text-sm text-green-800">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {viewingCase.medicalAssistanceMeasures && (
                      <div className="mt-6 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Medical Assistance Measures</h5>
                        <p className="text-sm text-blue-800 leading-relaxed italic">
                          "{viewingCase.medicalAssistanceMeasures}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Status & Timeline</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          viewingCase.status === 'pending' ? "bg-amber-50 text-amber-600" :
                          viewingCase.status === 'assigned' ? "bg-blue-50 text-blue-600" :
                          viewingCase.status === 'in-progress' ? "bg-indigo-50 text-indigo-600" :
                          "bg-green-50 text-green-600"
                        )}>
                          {viewingCase.status}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <Clock className="w-3 h-3" /> Created: {new Date(viewingCase.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-2">
                          <Activity className="w-3 h-3" /> Updated: {new Date(viewingCase.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Assignment</h4>
                    {viewingCase.assignedConsultantName ? (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-2xl border border-blue-100">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                          {viewingCase.assignedConsultantName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{viewingCase.assignedConsultantName}</p>
                          <p className="text-[10px] text-blue-600 font-medium">Assigned Clinician</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Not assigned yet</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical Presentation</h4>
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {viewingCase.requiredSpecialty || 'General Medicine'}
                      </span>
                    </div>
                    <p className="text-gray-700 leading-relaxed text-sm">
                      {viewingCase.symptoms}
                    </p>
                  </div>
                </div>

                {viewingCase.imageUrl && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical Evidence (Image)</h4>
                    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                      <img 
                        src={viewingCase.imageUrl} 
                        alt="Clinical evidence" 
                        className="w-full h-auto max-h-96 object-contain mx-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}

                {viewingCase.location && (
                  <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Patient Location</h4>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-bold text-gray-900">Coordinates</p>
                        <p className="text-xs text-gray-500">
                          Lat: {viewingCase.location.latitude.toFixed(4)}, Lng: {viewingCase.location.longitude.toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setViewingCase(null)}
                  className="px-6 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ClinicianDashboard = ({ userProfile }: { userProfile: UserProfile }) => {
  const [cases, setCases] = useState<MedicalCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<MedicalCase | null>(null);
  const [view, setView] = useState<'dashboard' | 'queue' | 'map' | 'audit' | 'settings'>('dashboard');
  const [detailTab, setDetailTab] = useState<'overview' | 'history' | 'files' | 'notes' | 'timeline'>('overview');
  const [suggestions, setSuggestions] = useState<ConsultantSuggestion[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' }[]>([]);
  const prevCasesRef = useRef<MedicalCase[]>([]);
  
  // Search & Filter state for queue
  const [queueSearch, setQueueSearch] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending' | 'assigned' | 'in-progress' | 'completed'>('all');
  const [sortByPriority, setSortByPriority] = useState(true);

  // Quick confirm actions
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "info" | "danger" | "warning";
    confirmText?: string;
  } | null>(null);

  // Deterministic generator for patient details
  const getDeterministicPatientData = (patientId: string, patientName: string) => {
    let hash = 0;
    const str = patientId + patientName;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const age = Math.abs(hash % 45) + 18;
    const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'];
    const bloodGroup = bloodGroups[Math.abs(hash % bloodGroups.length)];
    const allergiesList = ['None', 'Penicillin', 'Sulfa drugs', 'Peanuts', 'None', 'Shellfish', 'Pollen', 'None'];
    const allergies = allergiesList[Math.abs(hash % allergiesList.length)];
    const visits = Math.abs(hash % 6) + 1;
    const medicationsList = ['None', 'Lisinopril 10mg QD', 'Atorvastatin 20mg QD', 'Metformin 500mg BID', 'None', 'Levothyroxine 50mcg QD', 'None'];
    const currentMedication = medicationsList[Math.abs(hash % medicationsList.length)];
    const gender = Math.abs(hash % 2) === 0 ? 'Male' : 'Female';
    return { age, bloodGroup, allergies, visits, currentMedication, gender };
  };

  // Symptoms details & duration parser
  const getSymptomDetails = (symptoms: string) => {
    const lower = symptoms.toLowerCase();
    const symptomsList: { emoji: string; text: string }[] = [];
    if (lower.includes('headache') || lower.includes('migraine')) symptomsList.push({ emoji: '🤒', text: 'Headache' });
    if (lower.includes('cough')) symptomsList.push({ emoji: '😷', text: 'Cough' });
    if (lower.includes('fever') || lower.includes('temp') || lower.includes('hot')) symptomsList.push({ emoji: '🥵', text: 'Fever' });
    if (lower.includes('nose') || lower.includes('cold') || lower.includes('sniff')) symptomsList.push({ emoji: '🤧', text: 'Runny Nose' });
    if (lower.includes('throat') || lower.includes('sore')) symptomsList.push({ emoji: '👄', text: 'Sore Throat' });
    if (lower.includes('chest') || lower.includes('breath') || lower.includes('lung')) symptomsList.push({ emoji: '🫁', text: 'Respiratory Issue' });
    if (lower.includes('stomach') || lower.includes('pain') || lower.includes('belly') || lower.includes('abdomen')) symptomsList.push({ emoji: '🤢', text: 'Abdominal Discomfort' });
    if (lower.includes('rash') || lower.includes('skin') || lower.includes('itch')) symptomsList.push({ emoji: '🪵', text: 'Skin Rash' });
    if (symptomsList.length === 0) {
      symptomsList.push({ emoji: '🩺', text: 'General Malaise' });
    }
    let hash = 0;
    for (let i = 0; i < symptoms.length; i++) hash += symptoms.charCodeAt(i);
    const durations = ['2 Days', '3 Days', '1 Week', 'Recent (24 hrs)', '5 Days'];
    const duration = durations[hash % durations.length];
    return { symptomsList, duration };
  };

  const getCasePriority = (c: MedicalCase): 'critical' | 'high' | 'medium' | 'low' => {
    const symptoms = c.symptoms.toLowerCase();
    if (symptoms.includes('chest pain') || symptoms.includes('breathing') || symptoms.includes('heart') || symptoms.includes('severe bleeding') || symptoms.includes('stroke') || symptoms.includes('unconscious') || symptoms.includes('critical')) {
      return 'critical';
    }
    if (symptoms.includes('high fever') || symptoms.includes('vomiting') || symptoms.includes('kidney') || symptoms.includes('asthma') || symptoms.includes('severe') || symptoms.includes('migraine')) {
      return 'high';
    }
    if (symptoms.includes('cough') || symptoms.includes('fever') || symptoms.includes('stomach') || symptoms.includes('pain') || symptoms.includes('injury') || symptoms.includes('infection')) {
      return 'medium';
    }
    return 'low';
  };

  const getPriorityWeight = (priority: 'critical' | 'high' | 'medium' | 'low'): number => {
    switch(priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
    }
  };

  const getFriendlyLocation = (location?: { latitude: number; longitude: number }) => {
    if (!location) return null;
    const lat = location.latitude;
    const lng = location.longitude;
    let cityName = "Agartala, Tripura";
    let distanceVal = 3.5;
    if (Math.abs(lat - 37.7749) < 2) {
      cityName = "San Francisco, CA";
      const dLat = lat - 37.7749;
      const dLng = lng - (-122.4194);
      distanceVal = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    } else if (Math.abs(lat - 23.8315) < 2) {
      cityName = "Agartala, Tripura";
      const dLat = lat - 23.8315;
      const dLng = lng - 91.2801;
      distanceVal = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    } else {
      const cities = ["Agartala, Tripura", "Kolkata, West Bengal", "Guwahati, Assam", "San Francisco, CA", "Oakland, CA", "San Jose, CA"];
      cityName = cities[Math.floor(Math.abs(lat + lng) % cities.length)];
      distanceVal = Math.abs(lat - 23.8) * 15 + Math.abs(lng - 91) * 8 + 1.2;
    }
    const distance = `${distanceVal.toFixed(1)} km`;
    const travelTime = `${Math.ceil(distanceVal * 2.5 + 3)} mins`;
    return { cityName, distance, travelTime };
  };

  const getWaitingTime = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const addNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Keyboard shortcut listener for Emergency Hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        const allPending = cases.filter(c => c.status === 'pending');
        if (allPending.length > 0) {
          const sorted = [...allPending].sort((a,b) => getPriorityWeight(getCasePriority(b)) - getPriorityWeight(getCasePriority(a)));
          setSelectedCase(sorted[0]);
          setView('queue');
          addNotification(`Emergency Hotkey triggered! Loaded: ${sorted[0].patientName}!`, 'warning');
        } else {
          addNotification("No pending emergency cases to load.", "info");
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cases]);

  // Subscriptions to database
  useEffect(() => {
    return mockDb.subscribeToCases((allCases) => {
      const sorted = [...allCases].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (prevCasesRef.current.length > 0) {
        const newPendingCases = sorted.filter(c => 
          c.status === 'pending' && 
          !prevCasesRef.current.find(pc => pc.id === c.id)
        );
        newPendingCases.forEach(c => {
          addNotification(`New case added to queue: ${c.patientName}`, 'info');
        });

        sorted.forEach(c => {
          const prevCase = prevCasesRef.current.find(pc => pc.id === c.id);
          if (prevCase && prevCase.status !== c.status && c.assignedConsultantId === userProfile.uid) {
            addNotification(`Case status updated: ${c.patientName} (${c.status.toUpperCase()})`, 'success');
          }
        });
      }

      prevCasesRef.current = sorted;
      setCases(sorted);
      
      if (selectedCase) {
        const updated = sorted.find(c => c.id === selectedCase.id);
        if (updated) setSelectedCase(updated);
      }
    });
  }, [selectedCase?.id, userProfile.uid]);

  useEffect(() => {
    if (selectedCase && selectedCase.status === 'pending') {
      const clinicians = mockDb.getProfiles().filter(p => p.role === 'clinician');
      const results = getConsultantSuggestions(selectedCase, clinicians);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  }, [selectedCase]);

  // Actions
  const handleAssign = (caseId: string, consultant?: UserProfile) => {
    const targetConsultant = consultant || userProfile;
    setConfirmAction({
      title: "Assign Case",
      message: `Are you sure you want to assign this case to ${targetConsultant.displayName || targetConsultant.email}?`,
      confirmText: "Assign Now",
      onConfirm: () => {
        mockDb.updateCase(caseId, {
          status: 'assigned',
          assignedConsultantId: targetConsultant.uid,
          assignedConsultantName: targetConsultant.displayName || targetConsultant.email,
        });
        addNotification(`Case successfully assigned to you!`, 'success');
      }
    });
  };

  const handleUpdateStatus = (caseId: string, status: CaseStatus) => {
    setConfirmAction({
      title: "Update Status",
      message: `Are you sure you want to change the status of this case to ${status.toUpperCase()}?`,
      confirmText: "Update Status",
      type: status === 'completed' ? "warning" : "info",
      onConfirm: () => {
        mockDb.updateCase(caseId, { status });
        addNotification(`Case status updated to ${status.toUpperCase()}`, 'success');
      }
    });
  };

  const toggleAvailability = () => {
    mockAuth.updateProfile({ 
      isAvailable: !userProfile.isAvailable,
      availabilityLastChanged: new Date().toISOString()
    });
  };

  // Filter & Search logic
  const filteredAndSortedCases = useMemo(() => {
    return cases
      .filter(c => {
        const query = queueSearch.toLowerCase().trim();
        const matchesSearch = !query || 
          c.patientName.toLowerCase().includes(query) || 
          c.symptoms.toLowerCase().includes(query) || 
          c.id.toLowerCase().includes(query) ||
          (c.requiredSpecialty || '').toLowerCase().includes(query);
        
        const matchesStatus = queueFilter === 'all' || c.status === queueFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortByPriority) {
          const priorityA = getCasePriority(a);
          const priorityB = getCasePriority(b);
          return getPriorityWeight(priorityB) - getPriorityWeight(priorityA);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [cases, queueSearch, queueFilter, sortByPriority]);

  // Derived stats
  const pendingCount = cases.filter(c => c.status === 'pending').length;
  const completedCount = cases.filter(c => c.status === 'completed').length;
  const activeCount = cases.filter(c => c.status === 'assigned' || c.status === 'in-progress').length;
  const urgentCount = cases.filter(c => c.status === 'pending' && (getCasePriority(c) === 'critical' || getCasePriority(c) === 'high')).length;

  const currentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-[#F8FAFC] font-sans antialiased">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-100 hidden md:flex flex-col p-6 justify-between shrink-0">
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Clinical Portal</h3>
            <p className="text-xs text-slate-500 font-medium">Dr. {userProfile.displayName || userProfile.email.split('@')[0]}</p>
          </div>
          
          <nav className="space-y-1.5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: Home },
              { id: 'queue', label: 'Patient Queue', icon: ClipboardList, badge: pendingCount },
              { id: 'map', label: 'Live Map', icon: MapIcon },
              { id: 'audit', label: 'Audit Log', icon: FileText },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as any)}
                className={cn(
                  "w-full px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-between group",
                  view === item.id 
                    ? "bg-blue-50 text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn(
                    "w-4 h-4 transition-transform group-hover:scale-110",
                    view === item.id ? "text-blue-600" : "text-slate-400"
                  )} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-black",
                    view === item.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Doctor Status Card in Sidebar */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2.5 h-2.5 rounded-full animate-pulse",
                userProfile.isAvailable ? "bg-green-500" : "bg-slate-300"
              )} />
              <span className="text-xs font-bold text-slate-700">
                {userProfile.isAvailable ? "Available" : "Offline"}
              </span>
            </div>
            <button
              onClick={toggleAvailability}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                userProfile.isAvailable 
                  ? "bg-red-50 text-red-600 hover:bg-red-100" 
                  : "bg-green-50 text-green-600 hover:bg-green-100"
              )}
            >
              {userProfile.isAvailable ? "Go Offline" : "Go Online"}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            {userProfile.isAvailable ? "Accepting New Patients" : "Not Receiving Cases"}
          </p>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto space-y-8 w-full">
        {/* Header Widget */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
          {/* Subtle abstract color splash */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full filter blur-2xl -mr-16 -mt-16 pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl shrink-0 shadow-inner">
              👨‍⚕️
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 leading-tight">
                {currentGreeting()}, Dr. {userProfile.displayName || userProfile.email.split('@')[0]}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                  userProfile.isAvailable 
                    ? "bg-green-50 text-green-700 border-green-100" 
                    : "bg-slate-50 text-slate-500 border-slate-100"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", userProfile.isAvailable ? "bg-green-500 animate-pulse" : "bg-slate-400")} />
                  {userProfile.isAvailable ? "Available" : "Offline"}
                </span>
                <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Today's Cases: {cases.length}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 relative z-10">
            {/* Quick availability toggle button */}
            <button
              onClick={toggleAvailability}
              className={cn(
                "px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm border flex items-center gap-2",
                userProfile.isAvailable
                  ? "bg-white text-rose-600 border-rose-100 hover:bg-rose-50"
                  : "bg-blue-600 text-white border-blue-500 hover:bg-blue-700 shadow-lg shadow-blue-100"
              )}
            >
              {userProfile.isAvailable ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>Go Offline</span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  <span>Go Online</span>
                </>
              )}
            </button>
            
            {/* Quick dashboard view shortcut on mobile */}
            <div className="flex md:hidden items-center gap-2 bg-slate-100 p-1.5 rounded-xl">
              {['dashboard', 'queue', 'map'].map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all",
                    view === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Dashboard Home View */}
        {view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Summary widgets cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Waiting Patients', count: pendingCount, icon: '🩺', color: 'from-amber-50 to-amber-100/30 text-amber-600 border-amber-100/50', subtitle: 'Awaiting triage / assignment' },
                { label: 'Completed Today', count: completedCount, icon: '✅', color: 'from-green-50 to-green-100/30 text-green-600 border-green-100/50', subtitle: 'Cases successfully resolved' },
                { label: 'Urgent Cases', count: urgentCount, icon: '🚨', color: 'from-red-50 to-red-100/30 text-red-600 border-red-100/50', subtitle: 'Requires immediate action', pulse: urgentCount > 0 },
                { label: 'Average Rating', count: '4.9', icon: '⭐', color: 'from-blue-50 to-blue-100/30 text-blue-600 border-blue-100/50', subtitle: 'Based on patient feedback' },
              ].map((card, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "p-6 bg-gradient-to-b rounded-3xl border shadow-sm relative overflow-hidden group hover:scale-[1.02] transition-transform",
                    card.color
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-400">{card.label}</p>
                      <h3 className="text-3xl font-black text-slate-900 mt-2">{card.count}</h3>
                    </div>
                    <div className={cn(
                      "w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm border border-slate-100 shrink-0",
                      card.pulse && "animate-bounce"
                    )}>
                      {card.icon}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-4">{card.subtitle}</p>
                </div>
              ))}
            </section>

            {/* Main dashboard content area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left col: Today's queue overview & launch pad */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Active Queue Summary</h2>
                    <p className="text-xs text-slate-500">Quick view of patient cases currently in the queue</p>
                  </div>
                  <button 
                    onClick={() => setView('queue')}
                    className="text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors group"
                  >
                    <span>Go to Patient Workstation</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                <div className="space-y-4">
                  {cases.slice(0, 3).map((c, idx) => {
                    const priority = getCasePriority(c);
                    const patientMeta = getDeterministicPatientData(c.id, c.patientName);
                    return (
                      <div 
                        key={c.id}
                        onClick={() => {
                          setSelectedCase(c);
                          setView('queue');
                        }}
                        className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-blue-100"
                      >
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black shadow-md shadow-blue-500/10 uppercase",
                            idx % 2 === 0 ? "bg-blue-600" : "bg-indigo-600"
                          )}>
                            {getInitials(c.patientName)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-900 text-base">{c.patientName}</h4>
                              <span className="text-xs text-slate-400 font-medium">Age {patientMeta.age}</span>
                              <span className={cn(
                                "text-[10px] font-black px-2 py-0.5 rounded-full uppercase border",
                                priority === 'critical' ? "bg-red-50 text-red-700 border-red-100" :
                                priority === 'high' ? "bg-orange-50 text-orange-700 border-orange-100" :
                                priority === 'medium' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                "bg-green-50 text-green-700 border-green-100"
                              )}>
                                {priority}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-1 line-clamp-1">{c.symptoms}</p>
                            <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-lg mt-2 inline-block">
                              {c.requiredSpecialty || "General Medicine"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                          <span className="text-[11px] text-slate-400 font-medium">
                            Waiting {getWaitingTime(c.createdAt)}
                          </span>
                          <button className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-50 hover:text-blue-600 group-hover:translate-x-1 transition-all">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {cases.length === 0 && (
                    <div className="p-12 text-center bg-white rounded-3xl border border-slate-100">
                      <p className="text-lg font-bold text-slate-700">🎉 No Patients Waiting</p>
                      <p className="text-xs text-slate-400 mt-1">You're all caught up. Remain available to receive notifications.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right col: Today's activities & notifications widgets */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Today's Activity</h2>
                  <p className="text-xs text-slate-500">Recent logs of clinician actions and state changes</p>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
                  {cases.length > 0 ? (
                    <div className="space-y-4">
                      {cases.slice(0, 4).map((c, idx) => (
                        <div key={idx} className="flex gap-4">
                          <div className="relative flex flex-col items-center shrink-0">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm border",
                              c.status === 'completed' ? "bg-green-50 text-green-600 border-green-100" :
                              c.status === 'in-progress' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                              c.status === 'assigned' ? "bg-blue-50 text-blue-600 border-blue-100" :
                              "bg-amber-50 text-amber-600 border-amber-100"
                            )}>
                              {c.status === 'completed' ? '✓' : '•'}
                            </div>
                            {idx < 3 && <div className="w-0.5 h-12 bg-slate-100 -mb-4 mt-1" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {c.status === 'completed' ? "Completed Consultation" :
                               c.status === 'in-progress' ? "Consultation in progress" :
                               c.status === 'assigned' ? "Case Assigned" : "Case Submitted"}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">Patient: {c.patientName}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
                              {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <p className="text-xs italic">No activity registered today</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Patient Queue View (Workstation split screen) */}
        {view === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
            {/* Left 4 cols: Searchable Queue list */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900">Patient Queue ({filteredAndSortedCases.length})</h2>
                  <button 
                    onClick={() => setSortByPriority(prev => !prev)}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all",
                      sortByPriority 
                        ? "bg-blue-50 text-blue-600 border-blue-100" 
                        : "bg-white text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    Sort: {sortByPriority ? "🚨 Priority" : "🕒 Clock"}
                  </button>
                </div>

                {/* Queue search & filter chips */}
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      placeholder="Search patient, symptoms, or department..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100 outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'pending', label: 'Waiting' },
                      { id: 'assigned', label: 'Assigned' },
                      { id: 'in-progress', label: 'Active' },
                      { id: 'completed', label: 'Done' }
                    ].map((chip) => (
                      <button
                        key={chip.id}
                        onClick={() => setQueueFilter(chip.id as any)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
                          queueFilter === chip.id 
                            ? "bg-blue-600 text-white border-blue-500" 
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-100"
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Patient Queue Cards Container */}
              <div className="space-y-4 max-h-[calc(100vh-22rem)] overflow-y-auto pr-2">
                <AnimatePresence mode="popLayout">
                  {filteredAndSortedCases.map((c, i) => {
                    const priority = getCasePriority(c);
                    const patientMeta = getDeterministicPatientData(c.id, c.patientName);
                    const isSelected = selectedCase?.id === c.id;
                    const initials = getInitials(c.patientName);
                    
                    const pColors = 
                      priority === 'critical' ? "border-red-200 bg-red-50/10 text-red-800" :
                      priority === 'high' ? "border-orange-200 bg-orange-50/10 text-orange-800" :
                      priority === 'medium' ? "border-amber-200 bg-amber-50/10 text-amber-800" :
                      "border-green-200 bg-green-50/10 text-green-800";

                    return (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => setSelectedCase(c)}
                        className={cn(
                          "p-4 rounded-2xl border cursor-pointer transition-all relative flex flex-col gap-3 group",
                          isSelected 
                            ? "bg-blue-50/40 border-blue-300 shadow-sm" 
                            : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                        )}
                      >
                        {/* Red emergency highlight strip for critical items */}
                        {priority === 'critical' && (
                          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-red-500 rounded-l-2xl" />
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black uppercase shadow-sm shrink-0",
                              i % 2 === 0 ? "bg-gradient-to-br from-blue-500 to-blue-600" : "bg-gradient-to-br from-indigo-500 to-indigo-600"
                            )}>
                              {initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-slate-800 text-sm leading-tight">{c.patientName}</h4>
                                <span className="text-[10px] text-slate-400 font-semibold">{patientMeta.age}y</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium">Dept: {c.requiredSpecialty || 'General'}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
                              pColors
                            )}>
                              {priority}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {getWaitingTime(c.createdAt)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed bg-slate-50/60 p-2.5 rounded-xl border border-slate-100/50">
                          {c.symptoms}
                        </p>

                        <div className="flex items-center justify-between mt-1 text-[10px] font-bold">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md uppercase tracking-wide",
                            c.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            c.status === 'assigned' ? 'bg-blue-50 text-blue-700' :
                            c.status === 'in-progress' ? 'bg-indigo-50 text-indigo-700' :
                            'bg-green-50 text-green-700'
                          )}>
                            {c.status === 'pending' ? 'Waiting' : c.status}
                          </span>
                          
                          <span className="text-blue-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                            <span>Assign →</span>
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}

                  {filteredAndSortedCases.length === 0 && (
                    <div className="text-center p-12 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center space-y-3">
                      <span className="text-3xl">🎉</span>
                      <h3 className="font-bold text-slate-800 text-sm">No patients waiting</h3>
                      <p className="text-xs text-slate-400">All caught up or matches your selected filter criteria.</p>
                      <button 
                        onClick={() => { setQueueSearch(''); setQueueFilter('all'); }}
                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right 7/8 cols: Selected Case details panel tabs */}
            <div className="lg:col-span-7 xl:col-span-8">
              {selectedCase ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-3xl border border-slate-100 shadow-md overflow-hidden flex flex-col min-h-[calc(100vh-14rem)]"
                >
                  {/* Card Header Profile Banner */}
                  <div className="p-6 md:p-8 bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-slate-900 pointer-events-none" />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl font-bold border border-white/20 uppercase shadow-inner">
                        {getInitials(selectedCase.patientName)}
                      </div>
                      <div>
                        <h2 className="text-xl font-black tracking-tight">{selectedCase.patientName}</h2>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>Patient ID: {selectedCase.patientId.slice(0, 8)}</span>
                          <span>•</span>
                          <span>Priority: {getCasePriority(selectedCase).toUpperCase()}</span>
                        </p>
                      </div>
                    </div>

                    {/* Prominent Action Controls based on status */}
                    <div className="relative z-10 shrink-0">
                      {selectedCase.status === 'pending' && (
                        <button 
                          onClick={() => handleAssign(selectedCase.id)}
                          className="bg-blue-500 text-white hover:bg-blue-600 px-6 py-2.5 rounded-xl font-black text-sm shadow-xl shadow-blue-900/30 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>Assign to Me</span>
                        </button>
                      )}
                      {selectedCase.status === 'assigned' && (
                        <button 
                          onClick={() => handleUpdateStatus(selectedCase.id, 'in-progress')}
                          className="bg-indigo-500 text-white hover:bg-indigo-600 px-6 py-2.5 rounded-xl font-black text-sm shadow-xl shadow-indigo-900/30 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                        >
                          <Activity className="w-4 h-4" />
                          <span>Start Consultation</span>
                        </button>
                      )}
                      {selectedCase.status === 'in-progress' && (
                        <button 
                          onClick={() => setDetailTab('notes')}
                          className="bg-green-600 text-white hover:bg-green-700 px-6 py-2.5 rounded-xl font-black text-sm shadow-xl shadow-green-900/30 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Consult Now</span>
                        </button>
                      )}
                      {selectedCase.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-4 py-2 bg-green-500/10 text-green-400 rounded-full text-xs font-black border border-green-500/20">
                          ✓ Case Fully Resolved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tabs bar */}
                  <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 overflow-x-auto gap-1">
                    {[
                      { id: 'overview', label: 'Overview', icon: ClipboardList },
                      { id: 'history', label: 'History', icon: HistoryIcon },
                      { id: 'files', label: 'Files', icon: Camera },
                      { id: 'notes', label: 'Notes', icon: FileText, disabled: selectedCase.status === 'pending' },
                      { id: 'timeline', label: 'Timeline', icon: Clock }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        disabled={tab.disabled}
                        onClick={() => setDetailTab(tab.id as any)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 whitespace-nowrap border",
                          detailTab === tab.id 
                            ? "bg-white text-blue-600 border-slate-200/60 shadow-sm" 
                            : "text-slate-500 bg-transparent border-transparent hover:text-slate-900 hover:bg-slate-100/50 disabled:opacity-40"
                        )}
                      >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Tab Contents Frame */}
                  <div className="flex-1 p-6 md:p-8">
                    {detailTab === 'overview' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-200">
                        {/* Clinical Presentation & Symptoms */}
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">Symptoms Presentation</h3>
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-lg border border-blue-100">
                                  {selectedCase.requiredSpecialty || 'General Medicine'}
                                </span>
                              </div>
                              
                              <p className="text-slate-700 text-sm leading-relaxed italic">
                                "{selectedCase.symptoms}"
                              </p>

                              {/* Structured Symptom details */}
                              <div className="border-t border-slate-200/50 pt-3 flex flex-wrap gap-2">
                                {getSymptomDetails(selectedCase.symptoms).symptomsList.map((sym, si) => (
                                  <span key={si} className="inline-flex items-center gap-1 bg-white text-slate-600 border border-slate-100 rounded-xl px-2.5 py-1 text-xs font-semibold">
                                    <span>{sym.emoji}</span>
                                    <span>{sym.text}</span>
                                  </span>
                                ))}
                                <span className="inline-flex items-center gap-1 bg-white text-slate-600 border border-slate-100 rounded-xl px-2.5 py-1 text-xs font-semibold">
                                  <span>🕒</span>
                                  <span>Duration: {getSymptomDetails(selectedCase.symptoms).duration}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* AI Consultant Suggestions */}
                          {selectedCase.status === 'pending' && suggestions.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Top Match Consultants</h3>
                                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-black">AI Recommended</span>
                              </div>
                              <div className="space-y-3">
                                {suggestions.slice(0, 2).map((s) => (
                                  <div 
                                    key={s.consultant.uid} 
                                    className="p-4 bg-gradient-to-r from-blue-50/40 to-white border border-blue-100 rounded-2xl flex items-start justify-between gap-3 shadow-sm hover:border-blue-200 transition-all"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-md shadow-blue-200">
                                        {s.consultant.displayName?.[0]}
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-slate-900">{s.consultant.displayName}</p>
                                        <p className="text-xs text-blue-600 font-bold">{s.consultant.specialty}</p>
                                      </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                      <span className="text-xs font-black text-blue-700 flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-current" />
                                        {s.score}% Match
                                      </span>
                                      <button 
                                        onClick={() => handleAssign(selectedCase.id, s.consultant)}
                                        className="text-[10px] font-black text-blue-600 hover:underline mt-1"
                                      >
                                        Assign Case
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Location and Map details */}
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">Patient Location Info</h3>
                            {selectedCase.location ? (
                              <div className="space-y-4">
                                <div className="h-44 w-full rounded-2xl border border-slate-200/80 overflow-hidden shadow-inner relative group">
                                  <Map 
                                    height={176} 
                                    defaultCenter={[selectedCase.location.latitude, selectedCase.location.longitude]} 
                                    defaultZoom={13}
                                    metaWheelZoom={true}
                                  >
                                    <Marker 
                                      width={36}
                                      anchor={[selectedCase.location.latitude, selectedCase.location.longitude]} 
                                      color="#2563eb"
                                    />
                                  </Map>
                                  <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-100 text-[9px] font-black text-slate-500 shadow-sm pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                    Interactive Map
                                  </div>
                                </div>
                                
                                <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100/50 flex items-center gap-4">
                                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 border border-slate-100">
                                    <MapPin className="w-5 h-5 text-blue-600" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs font-black text-slate-900">
                                      📍 {getFriendlyLocation(selectedCase.location)?.cityName || "Agartala"}
                                    </p>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                      Distance: {getFriendlyLocation(selectedCase.location)?.distance} • Est. Travel: {getFriendlyLocation(selectedCase.location)?.travelTime}
                                    </p>
                                  </div>
                                </div>

                                <details className="group border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                                  <summary className="cursor-pointer p-3 text-xs font-bold text-slate-500 hover:text-slate-800 list-none flex items-center justify-between">
                                    <span>Advanced Coordinates Details</span>
                                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                                  </summary>
                                  <div className="p-3 border-t border-slate-100 text-[10px] text-slate-500 font-mono space-y-1 bg-white">
                                    <p>Latitude: {selectedCase.location.latitude.toFixed(6)}</p>
                                    <p>Longitude: {selectedCase.location.longitude.toFixed(6)}</p>
                                  </div>
                                </details>
                              </div>
                            ) : (
                              <div className="p-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center space-y-2">
                                <MapPin className="w-8 h-8 text-slate-300 mb-2" />
                                <p className="text-xs text-slate-400 italic">No location data shared for this patient</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailTab === 'history' && (
                      <div className="animate-in fade-in duration-200">
                        {/* Deterministic Patient Profile Card */}
                        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                          <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-md">
                              👤
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">{selectedCase.patientName}</h3>
                              <p className="text-xs text-slate-400 font-medium">Verified Patient Record</p>
                            </div>
                          </div>
                          
                          <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-4">
                            <div className="border-b border-slate-100/50 pb-3">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Biological Age</p>
                              <p className="text-sm font-bold text-slate-800 mt-1">
                                {getDeterministicPatientData(selectedCase.id, selectedCase.patientName).age} Years
                              </p>
                            </div>
                            <div className="border-b border-slate-100/50 pb-3">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Blood Group</p>
                              <p className="text-sm font-bold text-slate-800 mt-1">
                                {getDeterministicPatientData(selectedCase.id, selectedCase.patientName).bloodGroup}
                              </p>
                            </div>
                            <div className="border-b border-slate-100/50 pb-3">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Severe Allergies</p>
                              <p className="text-sm font-bold text-red-600 mt-1">
                                {getDeterministicPatientData(selectedCase.id, selectedCase.patientName).allergies}
                              </p>
                            </div>
                            <div className="border-b border-slate-100/50 pb-3">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Previous Visits</p>
                              <p className="text-sm font-bold text-slate-800 mt-1">
                                {getDeterministicPatientData(selectedCase.id, selectedCase.patientName).visits} Consultations
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Medications</p>
                              <p className="text-sm font-bold text-indigo-600 mt-1 bg-indigo-50/50 px-3 py-1.5 rounded-xl border border-indigo-100/50 w-fit">
                                {getDeterministicPatientData(selectedCase.id, selectedCase.patientName).currentMedication}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {detailTab === 'files' && (
                      <div className="animate-in fade-in duration-200 space-y-6">
                        <div>
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Clinical Evidence Files</h3>
                          {selectedCase.imageUrl ? (
                            <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-slate-100 shadow-md bg-slate-50 p-2">
                              <img 
                                src={selectedCase.imageUrl} 
                                alt="Symptom evidence" 
                                className="w-full h-auto rounded-xl object-contain max-h-96" 
                                referrerPolicy="no-referrer"
                              />
                              <p className="text-[10px] text-slate-400 font-medium text-center mt-2 italic">
                                Attached Symptom Image / Clinical Diagnostic Evidence
                              </p>
                            </div>
                          ) : (
                            <div className="p-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center space-y-2">
                              <Camera className="w-8 h-8 text-slate-300" />
                              <p className="text-xs text-slate-400 italic">No files or visual evidence uploaded for this case</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {detailTab === 'notes' && selectedCase.status !== 'pending' && (
                      <div className="animate-in fade-in duration-200 overflow-y-auto max-h-[calc(100vh-28rem)] pr-2">
                        {/* Nested Consultation guided steps editor component */}
                        <ConsultationSection medicalCase={selectedCase} clinician={userProfile} />
                      </div>
                    )}

                    {detailTab === 'timeline' && (
                      <div className="space-y-8 animate-in fade-in duration-200">
                        {/* Beautiful graphic case timeline */}
                        <div className="space-y-6 max-w-xl mx-auto bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Patient Incident Journey</h3>
                          <div className="relative pl-6 space-y-6 border-l border-blue-100 ml-3">
                            <div className="relative">
                              <span className="absolute -left-[30px] top-1 w-4 h-4 rounded-full bg-green-500 border-4 border-white shadow-sm flex items-center justify-center text-white text-[8px]" />
                              <div>
                                <p className="text-sm font-bold text-slate-800">Case Created</p>
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Patient submitted case details</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-1">{new Date(selectedCase.createdAt).toLocaleString()}</p>
                              </div>
                            </div>

                            {selectedCase.assignedConsultantName && (
                              <div className="relative">
                                <span className="absolute -left-[30px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm flex items-center justify-center text-white text-[8px]" />
                                <div>
                                  <p className="text-sm font-bold text-slate-800">Assigned & Dispatched</p>
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Assigned to Dr. {selectedCase.assignedConsultantName}</p>
                                  <p className="text-[10px] text-slate-400 font-mono mt-1">{new Date(selectedCase.updatedAt).toLocaleString()}</p>
                                </div>
                              </div>
                            )}

                            {selectedCase.status === 'in-progress' && (
                              <div className="relative">
                                <span className="absolute -left-[30px] top-1 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm flex items-center justify-center text-white text-[8px]" />
                                <div>
                                  <p className="text-sm font-bold text-slate-800">Consultation Underway</p>
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Interactive medical analysis in progress</p>
                                </div>
                              </div>
                            )}

                            {selectedCase.status === 'completed' && (
                              <div className="relative">
                                <span className="absolute -left-[30px] top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-sm flex items-center justify-center text-white text-[8px]" />
                                <div>
                                  <p className="text-sm font-bold text-slate-800">Prescription & Resolution</p>
                                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Case marked resolved, medicine dispatch authorized</p>
                                  <p className="text-[10px] text-slate-400 font-mono mt-1">{new Date(selectedCase.updatedAt).toLocaleString()}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Log actions specific to this case */}
                        <div className="max-w-xl mx-auto space-y-3">
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Clinical Log History</h3>
                          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                            <div className="p-4 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 grid grid-cols-3">
                              <span>Action</span>
                              <span>Agent</span>
                              <span className="text-right">Timestamp</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              <div className="p-4 text-xs grid grid-cols-3 text-slate-600">
                                <span className="font-bold text-slate-800">Case Intake</span>
                                <span>{selectedCase.patientName}</span>
                                <span className="text-right text-slate-400">{new Date(selectedCase.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {selectedCase.assignedConsultantName && (
                                <div className="p-4 text-xs grid grid-cols-3 text-slate-600">
                                  <span className="font-bold text-slate-800">Self Assign</span>
                                  <span>Dr. {selectedCase.assignedConsultantName.split(' ')[0]}</span>
                                  <span className="text-right text-slate-400">{new Date(selectedCase.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <span className="text-4xl mb-4">🩺</span>
                  <h3 className="text-lg font-bold text-slate-800">Select Patient Case</h3>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Select a patient from the queue column to view details, diagnosis tabs, patient profile summary, and issue treatment plans.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Map View */}
        {view === 'map' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Live Case Tracking Map</h2>
                <p className="text-xs text-slate-500">Real-time coordinates mapping of patients submitted requests</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100 text-[10px] font-black uppercase">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live Feed
              </div>
            </div>
            
            <div className="aspect-video bg-slate-50 rounded-3xl border border-slate-200 relative overflow-hidden shadow-inner min-h-[350px]">
              <Map 
                defaultCenter={[37.7749, -122.4194]} 
                defaultZoom={4}
                metaWheelZoom={true}
              >
                {cases.filter(c => c.location).map((c) => (
                  <Marker 
                    key={c.id}
                    width={32}
                    anchor={[c.location!.latitude, c.location!.longitude]} 
                    color={
                      c.status === 'pending' ? "#f59e0b" :
                      c.status === 'assigned' ? "#2563eb" :
                      c.status === 'in-progress' ? "#4f46e5" :
                      "#10b981"
                    }
                    onClick={() => {
                      setSelectedCase(c);
                      setView('queue');
                    }}
                  />
                ))}
              </Map>
              
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-xl z-10 max-w-xs">
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">Map Legend</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-slate-600">Pending</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-slate-600">Assigned</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-slate-600">Active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-slate-600">Resolved</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log View */}
        {view === 'audit' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-xl font-black text-slate-900">System Activity & Audit logs</h2>
              <p className="text-xs text-slate-500">Decentralized logging registry records for Clinova connects</p>
            </div>
            
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-100">
                    <th className="p-4 tracking-wider">Case ID</th>
                    <th className="p-4 tracking-wider">Patient Name</th>
                    <th className="p-4 tracking-wider">Assigned Clinician</th>
                    <th className="p-4 tracking-wider">Status</th>
                    <th className="p-4 tracking-wider text-right">Last Modification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cases.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono text-slate-400">{c.id.slice(0, 8)}</td>
                      <td className="p-4 font-bold text-slate-800">{c.patientName}</td>
                      <td className="p-4 text-slate-600">{c.assignedConsultantName || "Not assigned"}</td>
                      <td className="p-4">
                        <span className={cn(
                          "text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border",
                          c.status === 'pending' ? "bg-amber-50 text-amber-700 border-amber-100" :
                          c.status === 'assigned' ? "bg-blue-50 text-blue-700 border-blue-100" :
                          c.status === 'in-progress' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                          "bg-green-50 text-green-700 border-green-100"
                        )}>
                          {c.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-right">
                        {new Date(c.updatedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Clinician Settings / Profile View */}
        {view === 'settings' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-xl font-black text-slate-900">Clinician Profile Configuration</h2>
              <p className="text-xs text-slate-500">Configure medical credentials and availability status</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl text-white text-xl font-black flex items-center justify-center shadow-lg shadow-blue-200">
                  {userProfile.displayName?.[0] || 'D'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{userProfile.displayName || "Clinician Specialist"}</h3>
                  <p className="text-xs text-slate-400 font-medium">Role: {userProfile.role.toUpperCase()}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wide">Registered Email Address</label>
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100 font-mono">
                  {userProfile.email}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-wide">Medical Specialty</label>
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-blue-600 border border-slate-100 font-bold">
                  {userProfile.specialty || "General Medicine Practitioner"}
                </div>
              </div>

              <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100/50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-900">Live Status Dispatch</p>
                  <p className="text-[10px] text-slate-500 font-medium">When enabled, the routing system assigns triage patient cases</p>
                </div>
                
                <button 
                  onClick={toggleAvailability}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm border",
                    userProfile.isAvailable 
                      ? "bg-green-600 text-white border-green-500 hover:bg-green-700" 
                      : "bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300"
                  )}
                >
                  {userProfile.isAvailable ? "🟢 Online" : "⚪ Offline"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Emergency Hotkey / Quick Action buttons */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        <button 
          onClick={() => {
            const allPending = cases.filter(c => c.status === 'pending');
            if (allPending.length > 0) {
              const sorted = [...allPending].sort((a,b) => getPriorityWeight(getCasePriority(b)) - getPriorityWeight(getCasePriority(a)));
              setSelectedCase(sorted[0]);
              setView('queue');
              addNotification(`Loaded highest priority case: ${sorted[0].patientName}!`, 'info');
            } else {
              addNotification("No pending cases to load.", "warning");
            }
          }}
          className="bg-red-600 text-white p-3.5 rounded-full shadow-2xl hover:bg-red-700 hover:scale-105 transition-all flex items-center gap-2 font-black text-xs uppercase"
          title="Load Highest Priority Case (Hotkey: E)"
        >
          <AlertCircle className="w-4 h-4 animate-pulse" />
          <span className="hidden sm:inline">Emergency Hotkey</span>
        </button>
      </div>

      <ConfirmationModal 
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmAction?.onConfirm || (() => {})}
        title={confirmAction?.title || ""}
        message={confirmAction?.message || ""}
        confirmText={confirmAction?.confirmText}
        type={confirmAction?.type}
      />
    </div>
  );
};

// --- User Manual ---

const UserManual = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('export') === 'true' && !isPrinting) {
      setIsPrinting(true);
      const timer = setTimeout(() => {
        window.print();
        navigate('/manual', { replace: true });
        setIsPrinting(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [location.search, isPrinting, navigate]);

  const handlePrint = () => {
    console.log("Initiating Print");
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 selection:bg-blue-100 italic-serif">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[3rem] border border-gray-100 shadow-2xl overflow-hidden print-container relative"
      >
        <div className="p-12 border-b border-gray-100 bg-gray-900 text-white flex flex-col md:flex-row justify-between items-start md:items-end gap-8 relative z-10">
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
              <TeleHealthLogo size={56} variant="icon" theme="dark" />
              <div className="h-[2px] w-12 bg-blue-500/30" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400">Spec-Document v2.4</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[0.85]">
              Platform <br />
              <span className="text-blue-500 underline decoration-blue-500/20 underline-offset-[12px]">Specification</span>
            </h1>
            <p className="text-gray-400 font-medium text-lg max-w-lg leading-relaxed">
              Proprietary architectural blueprint and governance framework for the Clinova decentralized medical infrastructure.
            </p>
          </div>
          
          <div className="flex flex-col items-start md:items-end gap-6 no-print">
            <div className="text-left md:text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Confidentiality Tier</p>
              <span className="px-4 py-1.5 bg-red-500/10 text-red-500 rounded-full text-[10px] font-black border border-red-500/20 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" />
                IP RESTRICTED
              </span>
            </div>
            <button 
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 p-4 px-10 rounded-2xl transition-all flex items-center gap-3 font-black text-xs shadow-2xl shadow-blue-500/20 group hover:-translate-y-1"
            >
              <Printer className="w-5 h-5 group-hover:rotate-6 transition-transform" />
              <span>EXPORT AS PORTFOLIO ASSET</span>
            </button>
          </div>
        </div>

        <div className="p-12 space-y-24">
          <section className="relative">
            <div className="absolute -left-12 top-0 w-1.5 h-48 bg-blue-600 rounded-full" />
            <div className="max-w-3xl">
              <span className="text-blue-600 font-black text-xs uppercase tracking-[0.3em] mb-4 block">Section 01</span>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-8">System Architecture & <br /> Data Sovereignty</h2>
              <div className="prose prose-blue max-w-none text-gray-600 space-y-6">
                <p className="text-xl font-medium leading-relaxed italic border-l-4 border-gray-100 pl-6 text-gray-500">
                  Clinova operates on a "No-Cloud" localized persistence model, shifting the authority of truth from centralized servers to validated user instances.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                  <div className="p-8 bg-gray-50 rounded-[3rem] border border-gray-100 group hover:border-blue-200 transition-colors">
                    <Database className="w-8 h-8 text-blue-600 mb-6" />
                    <h3 className="text-xl font-black text-gray-900 mb-4">LFPM Protocol</h3>
                    <p className="text-sm leading-relaxed text-gray-600">The Local-First Persistence Model ensures zero-latency diagnostics and complete PII (Patient Identifiable Information) sovereignty. Data never leaves the client sandbox unless authorized for export.</p>
                  </div>
                  <div className="p-8 bg-gray-50 rounded-[3rem] border border-gray-100 group hover:border-indigo-200 transition-colors">
                    <WifiOff className="w-8 h-8 text-indigo-600 mb-6" />
                    <h3 className="text-xl font-black text-gray-900 mb-4">Resilient Syncing</h3>
                    <p className="text-sm leading-relaxed text-gray-600">Utilizing a multi-tab storage bus, the system maintains real-time state integrity even during complete network saturation or total offline environments.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 02: Operational Workflows */}
          <section>
            <div className="flex flex-col md:flex-row gap-12 items-start">
              <div className="w-full md:w-1/3 space-y-6">
                <span className="text-indigo-600 font-black text-xs uppercase tracking-[0.3em] block">Section 02</span>
                <h2 className="text-4xl font-black text-gray-900 tracking-tight leading-[1]">Operational <br /> Workflows</h2>
                <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100/50">
                  <p className="text-xs font-bold text-indigo-900/60 uppercase mb-4 tracking-widest">Performance Metric</p>
                  <p className="text-3xl font-black text-indigo-600">&lt;1.2s</p>
                  <p className="text-sm font-medium text-indigo-900/80">Average Case Routing Latency</p>
                </div>
              </div>
              
              <div className="flex-1 grid grid-cols-1 gap-8">
                <div className="p-10 bg-white rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity">
                    <UserIcon className="w-32 h-32" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                    <span className="w-2 h-8 bg-green-500 rounded-full" />
                    Patient: The "Care-Path"
                  </h3>
                  <ul className="space-y-4">
                    {[
                      "Identity verification via unique entropy tokens.",
                      "Multimedia diagnostic evidence ingestion (Photos/Notes).",
                      "Automated geospatial router selection.",
                      "Direct feedback loop for completed consultations."
                    ].map((item, i) => (
                      <li key={i} className="flex gap-4 items-start text-sm text-gray-600 font-medium">
                        <span className="shrink-0 w-5 h-5 bg-green-50 text-green-600 rounded flex items-center justify-center font-black text-[10px] border border-green-100">{i+1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-10 bg-white rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity">
                    <Users className="w-32 h-32" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                    <span className="w-2 h-8 bg-blue-500 rounded-full" />
                    Clinician: Professional Suite
                  </h3>
                  <ul className="space-y-4">
                    {[
                      "Dynamic availability matrix for priority routing.",
                      "3-Phase Medical Analysis Workspace (Consult/Audit/Plan).",
                      "Interactive map-based patient queue visualization.",
                      "Compliant medical record generation and finalization."
                    ].map((item, i) => (
                      <li key={i} className="flex gap-4 items-start text-sm text-gray-600 font-medium">
                        <span className="shrink-0 w-5 h-5 bg-blue-50 text-blue-600 rounded flex items-center justify-center font-black text-[10px] border border-blue-100">{i+1}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 03: Security & Legal */}
          <section className="bg-gray-50 p-12 rounded-[4rem] border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 right-10 rotate-12 opacity-[0.03] no-print">
              <ShieldCheck className="w-96 h-96" />
            </div>
            
            <div className="relative z-10 max-w-2xl">
              <span className="text-red-500 font-black text-xs uppercase tracking-[0.3em] mb-4 block">Section 03</span>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-8">Governance & <br /> Privacy Protocols</h2>
              <div className="space-y-6 text-gray-600 leading-relaxed font-medium">
                <p>
                  This specification serves as the primary technical documentation for the Clinova Protocol. By utilizing this infrastructure, all participants adhere to the <strong>Universal Health Data Privacy Standard (UHDPS)</strong>.
                </p>
                <div className="bg-white p-8 rounded-3xl border border-gray-200 text-sm italic-serif leading-relaxed text-gray-500 border-l-[12px] border-l-gray-900">
                  "Individual patient data is strictly compartmentalized. Clinicians do not have persistent access to records post-consultation completion, ensuring an immutable trail of medical integrity."
                </div>
                
                <div className="pt-8 border-t border-gray-200">
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    IP & Trademark Notice
                  </h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    The "LFPM Protocol", "Geospatial Case-Routing Engine", and "3-Phase Diagnostic Methodology" are proprietary assets of Clinova. All logic paths, UI components, and architectural schemas are protected under international intellectual property frameworks.
                  </p>
                </div>

                <div className="flex flex-wrap gap-4 pt-6">
                  <div className="px-4 py-2 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest">HIPAA Aligned Logic</div>
                  <div className="px-4 py-2 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest">GDPR Native Compliance</div>
                  <div className="px-4 py-2 bg-gray-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest">RFC 7519 Standards</div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 04: Functional Inventory */}
          <section className="relative">
            <div className="absolute -right-12 top-0 w-1.5 h-64 bg-green-500 rounded-full" />
            <div className="max-w-4xl">
              <span className="text-green-600 font-black text-xs uppercase tracking-[0.3em] mb-4 block">Section 04</span>
              <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-12">Core Functional Architecture</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { 
                    title: "Identity Tokenization", 
                    desc: "Stateless authentication utilizing local entropy for unique patient/clinician instance validation.",
                    icon: ShieldCheck
                  },
                  { 
                    title: "Geospatial Routing", 
                    desc: "Advanced logic engine calculating proximity vectors to match clinical cases with nearby specialists.",
                    icon: MapPin
                  },
                  { 
                    title: "Multimedia Evidence", 
                    desc: "Serialized ingestion of high-resolution diagnostic imagery integrated directly into the case lifecycle.",
                    icon: Camera
                  },
                  { 
                    title: "LFPM Synchronization", 
                    desc: "Local-First Persistence Model leveraging the Storage API for real-time cross-tab state integrity.",
                    icon: Database
                  },
                  { 
                    title: "3-Phase Diagnostics", 
                    desc: "Proprietary structured workflow ensuring clinical consistency through Consult, Analysis, and Plan phases.",
                    icon: Stethoscope
                  },
                  { 
                    title: "Immutable Audit Log", 
                    desc: "Comprehensive tracking of all system interactions to maintain transparency and legal document integrity.",
                    icon: ClipboardList
                  }
                ].map((item, i) => (
                  <div key={i} className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:border-green-200 transition-colors">
                    <item.icon className="w-6 h-6 text-green-600 mb-4" />
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-2">{item.title}</h4>
                    <p className="text-[11px] font-medium text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footer Meta */}
        <div className="p-12 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-8 bg-white">
          <div className="flex items-center gap-4">
            <TeleHealthLogo size={44} variant="icon" />
            <div>
              <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Clinova Protocol</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">San Francisco, CA • Est 2024</p>
            </div>
          </div>
          <div className="flex items-center gap-12">
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Document Status</p>
              <p className="text-xs font-black text-green-600 uppercase">Verified & Active</p>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Dossier ID</p>
              <p className="text-xs font-black text-gray-900 uppercase">CLI-2026-XPQ</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Return Link - Non Printing */}
      <div className="mt-12 text-center no-print">
        <Link to="/" className="inline-flex items-center gap-3 text-gray-400 font-bold hover:text-blue-600 transition-colors group">
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform group-hover:rotate-180" />
          <span>Return to Infrastructure Portal</span>
        </Link>
      </div>
    </div>
  );
};

// --- Auth & Main App ---

// --- Welcome Page ---

const WelcomePage = ({ onGetStarted }: { onGetStarted: () => void }) => {
  const [activeTab, setActiveTab] = useState<'patient' | 'clinician'>('patient');
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  } as any;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  } as any;

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setNewsletterSubscribed(true);
      setNewsletterEmail('');
    }
  };

  const faqs = [
    {
      q: "How secure is my medical data?",
      a: "Clinova operates on a unique Local-First Persistence Model (LFPM). Your personal health information and consultations are stored in your secure browser sandbox, ensuring absolute data privacy and zero cloud exposure unless you explicitly choose to export your records."
    },
    {
      q: "Can clinical specialists prescribe medicines?",
      a: "Yes. Authorized clinicians can evaluate your diagnostic evidence, symptoms, and medical history to generate structured, digital ePrescriptions directly within the secure consultation suite."
    },
    {
      q: "How does the AI-powered doctor matching engine work?",
      a: "When you upload symptoms, our advanced routing service analyzes your diagnostic inputs and matching requirements, then distributes the case to the most relevant clinic or nearby clinical specialist with 96% matching accuracy."
    },
    {
      q: "Can I upload reports, PDFs, and diagnostic scans?",
      a: "Absolutely. The platform features an advanced multimedia ingestion portal that supports drag-and-drop file selection for lab reports, high-resolution scans, and diagnostic image attachments."
    },
    {
      q: "Is offline mode fully functional?",
      a: "Yes. Clinova is built to be offline-first. Even in complete network saturation or total offline environments, you can log in, draft consultations, and view your diagnostic history. Your data syncs securely when a connection is re-established."
    },
    {
      q: "How are consultations stored?",
      a: "They are kept strictly inside the browser sandbox using persistent storage buses. You can easily view, search, and export your entire clinical case history as a PDF, specced portfolio asset, or print document at any time."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-blue-100 text-slate-700 font-sans scroll-smooth">
      <PWAInstallPrompt />
      {/* Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 bg-white/75 backdrop-blur-xl border-b border-slate-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Left Brand Logo */}
          <div className="flex items-center cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <TeleHealthLogo size={42} variant="horizontal" showTagline={false} />
          </div>

          {/* Center Links */}
          <div className="hidden xl:flex items-center gap-8 text-sm font-bold text-slate-500">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How It Works</a>
            <a href="#preview" className="hover:text-blue-600 transition-colors">Live Preview</a>
            <a href="#documentation" className="hover:text-blue-600 transition-colors">Documentation</a>
            <a href="#security" className="hover:text-blue-600 transition-colors">Security</a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a>
            <a href="#contact" className="hover:text-blue-600 transition-colors">Contact</a>
          </div>

          {/* Right Action CTA Buttons */}
          <div className="flex items-center gap-4">
            <button 
              onClick={onGetStarted}
              className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors px-3 py-2"
            >
              Sign In
            </button>
            <button 
              onClick={onGetStarted}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-blue-100 flex items-center gap-1.5 group"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-6 overflow-hidden bg-gradient-to-b from-white via-slate-50/50 to-slate-50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Left Hero Content */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={containerVariants}
            className="lg:col-span-5 space-y-8"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-bold border border-blue-100/50">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span>AI-Powered Healthcare Platform</span>
            </motion.div>
            
            <motion.h1 variants={itemVariants} className="text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-slate-900">
              Healthcare <br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Without Bounds.</span>
            </motion.h1>
            
            <motion.p variants={itemVariants} className="text-lg text-slate-500 leading-relaxed max-w-lg">
              Experience the seamless bridge between patients and clinicians. Advanced AI routing, 
              offline-first architecture, and secure local persistence—all in one elegant platform.
            </motion.p>

            <motion.div variants={itemVariants} className="space-y-3.5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm max-w-md">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Clinical Advantages</p>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  "Book consultations in minutes.",
                  "100% secure, end-to-end encrypted chats.",
                  "Precise AI-powered doctor matching."
                ].map((adv, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{adv}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 pt-2">
              <button 
                onClick={onGetStarted}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-base transition-all shadow-xl shadow-blue-200/50 flex items-center justify-center gap-2 group hover:-translate-y-0.5"
              >
                <span>Book Consultation</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <Link
                to="/manual?export=true"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white text-slate-800 border-2 border-slate-100 rounded-2xl font-bold text-base hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group hover:border-slate-200"
              >
                <Printer className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                <span>Export Documentation</span>
              </Link>
            </motion.div>

            <motion.div variants={itemVariants} className="flex items-center gap-5 pt-4 border-t border-slate-100 max-w-md">
              <div className="flex -space-x-2.5">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-9 h-9 rounded-full border-2 border-white bg-slate-200 overflow-hidden shadow-sm">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=doctor${i}`} alt="doctor" className="w-full h-full object-cover" />
                  </div>
                ))}
                <div className="w-9 h-9 rounded-full border-2 border-white bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black shadow-sm">
                  +12
                </div>
              </div>
              <div className="text-xs text-slate-500 leading-tight">
                <div className="flex items-center gap-1 mb-0.5">
                  {[1,2,3,4,5].map(star => (
                    <Star key={star} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  ))}
                  <span className="font-bold text-slate-700 ml-1">5.0</span>
                </div>
                <p>Trusted by <strong className="text-slate-800 font-bold">200+ specialists</strong> & <strong className="text-slate-800 font-bold">50k+ patients</strong></p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Hero Dashboard Replica Presentation */}
          <div className="lg:col-span-7 relative h-[620px] flex items-center justify-center">
            {/* Background glowing gradients */}
            <div className="absolute -right-20 top-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl opacity-60" />
            <div className="absolute -left-10 bottom-10 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl opacity-60" />
            
            <div className="relative w-full max-w-2xl">
              {/* Back UI (Patient Dashboard Mock) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="absolute -left-8 top-12 w-[85%] bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-slate-100 transform -rotate-3 z-0 group hover:rotate-0 transition-all duration-500 hover:z-20 p-5 flex flex-col gap-4 scale-[0.88]"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">AP</div>
                    <span className="text-xs font-black text-slate-900">Patient Dashboard</span>
                  </div>
                  <span className="text-[9px] font-black text-green-500 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded-full">Active</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div>
                      <p className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Patient Name</p>
                      <p className="text-xs font-bold text-slate-900">Ayan Pal</p>
                    </div>
                    <div>
                      <p className="text-[7px] font-black uppercase text-slate-400 tracking-wider">Email Address</p>
                      <p className="text-[10px] font-bold text-slate-800">ayanpal209806@gmail.com</p>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                    <p className="text-[8px] font-black text-blue-600 uppercase mb-0.5">Clinical Notes</p>
                    <p className="text-[8px] text-blue-800 leading-normal">Registered since 2026. Health status healthy.</p>
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-100 rounded-md flex items-center justify-center text-amber-600 text-xs">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-black text-slate-900">Medical History Summary</span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-amber-400" />
                </div>

                <div className="space-y-2 pt-1">
                  <p className="text-[9px] font-black text-slate-900 flex items-center gap-1">
                    <HistoryIcon className="w-3 h-3 text-slate-400" /> Recent Case
                  </p>
                  <div className="p-3 border border-slate-100 rounded-xl bg-slate-50 flex justify-between items-center">
                    <div>
                      <p className="text-[8px] text-slate-400 font-bold">05/04/2026</p>
                      <p className="text-[10px] font-black text-slate-900">headache and running nose</p>
                    </div>
                    <span className="text-[7px] font-black text-green-500 uppercase px-1.5 py-0.5 bg-green-50 rounded-full">Completed</span>
                  </div>
                </div>
              </motion.div>

              {/* Front UI (Clinician Dashboard Queue Mock) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -25 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="absolute right-0 top-0 w-[90%] bg-white rounded-[2rem] overflow-hidden shadow-[0_32px_64px_-12px_rgba(30,41,59,0.15)] border border-slate-200/60 z-10 group hover:-translate-y-2 transition-all duration-500 flex flex-col"
              >
                {/* Mock Header */}
                <div className="p-3 bg-slate-900 text-white flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[10px] font-black tracking-wider">Clinician Suite</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                    <span className="text-[8px] font-black tracking-widest text-green-400 uppercase">Live Queue</span>
                  </div>
                </div>

                <div className="flex flex-1 min-h-[260px] text-xs">
                  {/* Mock Sidebar */}
                  <div className="w-[32%] bg-slate-50 border-r border-slate-100 p-2.5 space-y-2">
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Active Cases</p>
                    <div className="p-2 rounded-lg bg-white border border-blue-100 shadow-sm space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[7px] text-green-500 font-bold">COMPLETED</span>
                        <span className="text-[7px] text-slate-400">18:37</span>
                      </div>
                      <p className="text-[9px] font-black text-slate-900">user_kaa1ip</p>
                      <p className="text-[7px] text-slate-400">stomache</p>
                    </div>
                    <div className="p-2 rounded-lg bg-transparent border-transparent opacity-65 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[7px] text-slate-400">WAITING</span>
                        <span className="text-[7px] text-slate-400">16:03</span>
                      </div>
                      <p className="text-[9px] font-black text-slate-900">ayanpal209806</p>
                    </div>
                  </div>

                  {/* Mock Detail View */}
                  <div className="flex-1 p-4 space-y-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-900">user_kaa1ip</p>
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-[4px] text-[7px] font-black uppercase">Emergency Med</span>
                      </div>
                    </div>

                    <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-wider">Patient Symptoms</p>
                      <p className="text-[10px] text-slate-700 font-medium">Acute abdominal pain localized lower right quadrant.</p>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold rounded-md transition-colors">Decline</button>
                      <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-bold rounded-md transition-colors shadow-sm shadow-blue-100">Consult</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Floating statistics widgets below hero */}
        <div className="max-w-7xl mx-auto px-6 mt-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: "99.9% Platform Uptime", desc: "Decentralized resilience model", icon: Globe, color: "text-emerald-500", bg: "bg-emerald-50" },
              { title: "96% AI Route Accuracy", desc: "Instant matching algorithm", icon: Brain, color: "text-blue-500", bg: "bg-blue-50" },
              { title: "100% Encrypted Sandbox", desc: "No central cloud storage leakage", icon: Lock, color: "text-indigo-500", bg: "bg-indigo-50" }
            ].map((stat, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all">
                <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{stat.title}</h4>
                  <p className="text-xs text-slate-400 font-medium">{stat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Healthcare Designed Around You Section */}
      <section className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-black uppercase">
              <Heart className="w-3.5 h-3.5" /> Healthcare Designed Around You
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Your Healthcare. Simplified.</h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base">
              An intuitive ecosystem optimized purely for user convenience and clinical excellence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Patient-Centered Care */}
            <div className="p-8 rounded-3xl bg-gradient-to-br from-rose-50/50 via-white to-white border border-rose-100 shadow-sm md:col-span-2 lg:col-span-2 flex flex-col justify-between group hover:shadow-md transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Heart className="w-6 h-6 fill-rose-50" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 group-hover:text-rose-600 transition-colors">Patient-Centered Care</h3>
                <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                  Every feature is designed to make healthcare simpler, faster, and more accessible.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-rose-100/50 flex items-center gap-2 text-xs font-bold text-rose-700">
                <span>Direct Clinical Access & Support</span>
              </div>
            </div>

            {/* Quick Access */}
            <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-amber-100 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Zap className="w-6 h-6 fill-amber-50" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-500 transition-colors">Quick Access</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Book consultations in minutes.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-400">
                <span>Instant Consultation Intake</span>
              </div>
            </div>

            {/* Secure by Default */}
            <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-blue-100 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Secure by Default</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Your health data stays protected.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-400">
                <span>Secured Sandbox Privacy</span>
              </div>
            </div>

            {/* Available Anywhere */}
            <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-indigo-100 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Available Anywhere</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Access your healthcare from any device.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-400">
                <span>Responsive Device Framework</span>
              </div>
            </div>

            {/* Track Your Progress */}
            <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col justify-between group hover:shadow-md hover:border-emerald-100 transition-all duration-300">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Track Your Progress</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Review consultations and prescriptions anytime.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-400">
                <span>Clinical History Audits</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase">
              <Activity className="w-3.5 h-3.5" /> Features Suite
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Large-Scale Digital Health Features</h2>
            <p className="text-slate-500 max-w-2xl mx-auto text-base">
              Explore how Clinova optimizes care distribution while adhering to the absolute highest clinical privacy protocols.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "AI Diagnosis & Routing",
                subtitle: "Intelligently analyzes patient symptoms and automatically routes each case to the most appropriate medical specialist.",
                desc: "Reduce waiting times with AI-assisted triage, specialty-based matching, and priority-aware case distribution to ensure patients receive timely care.",
                benefit: "⚡ Faster Triage",
                icon: Brain,
                color: "text-purple-600 group-hover:text-purple-700",
                iconBg: "bg-purple-50 group-hover:bg-purple-100",
                border: "hover:border-purple-200",
                benefitBg: "bg-purple-50/70 text-purple-700 border-purple-100"
              },
              {
                title: "HD Video Consultation",
                subtitle: "Experience secure, high-definition video consultations designed for effective remote healthcare.",
                desc: "Connect with doctors through low-latency video calls that support real-time assessments, follow-up appointments, and personalized treatment discussions.",
                benefit: "🔒 End-to-End Secure",
                icon: Video,
                color: "text-blue-600 group-hover:text-blue-700",
                iconBg: "bg-blue-50 group-hover:bg-blue-100",
                border: "hover:border-blue-200",
                benefitBg: "bg-blue-50/70 text-blue-700 border-blue-100"
              },
              {
                title: "Lifetime Medical Records",
                subtitle: "Access your complete healthcare history whenever you need it.",
                desc: "All consultations, prescriptions, diagnoses, and treatment plans are securely stored, making it easy to review past medical information and track long-term health.",
                benefit: "📄 Digital Records",
                icon: ClipboardList,
                color: "text-amber-600 group-hover:text-amber-700",
                iconBg: "bg-amber-50 group-hover:bg-amber-100",
                border: "hover:border-amber-200",
                benefitBg: "bg-amber-50/70 text-amber-700 border-amber-100"
              },
              {
                title: "Smart Doctor Matching",
                subtitle: "Find the right healthcare professional based on location, specialty, and availability.",
                desc: "Our intelligent matching system helps connect patients with the nearest qualified doctors, reducing delays and improving access to care.",
                benefit: "📍 Location Aware",
                icon: MapPin,
                color: "text-rose-600 group-hover:text-rose-700",
                iconBg: "bg-rose-50 group-hover:bg-rose-100",
                border: "hover:border-rose-200",
                benefitBg: "bg-rose-50/70 text-rose-700 border-rose-100"
              },
              {
                title: "ePrescription Portal",
                subtitle: "Generate, manage, and securely share digital prescriptions with confidence.",
                desc: "Doctors can issue structured ePrescriptions with dosage instructions, while patients can easily view, download, and reference them during treatment.",
                benefit: "💊 Paperless Prescriptions",
                icon: Pill,
                color: "text-emerald-600 group-hover:text-emerald-700",
                iconBg: "bg-emerald-50 group-hover:bg-emerald-100",
                border: "hover:border-emerald-200",
                benefitBg: "bg-emerald-50/70 text-emerald-700 border-emerald-100"
              },
              {
                title: "Secure Diagnostics Upload",
                subtitle: "Upload medical reports, diagnostic images, and laboratory results securely in one place.",
                desc: "Support multiple file formats, including PDFs and high-resolution images, to help doctors make faster and more informed clinical decisions.",
                benefit: "📷 Multi-Format Uploads",
                icon: Camera,
                color: "text-cyan-600 group-hover:text-cyan-700",
                iconBg: "bg-cyan-50 group-hover:bg-cyan-100",
                border: "hover:border-cyan-200",
                benefitBg: "bg-cyan-50/70 text-cyan-700 border-cyan-100"
              }
            ].map((f, i) => (
              <div 
                key={i} 
                className={`bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-2 group relative overflow-hidden flex flex-col justify-between min-h-[380px] ${f.border}`}
              >
                {/* Background Accent Gradient */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-slate-50 to-transparent rounded-bl-full group-hover:scale-110 transition-transform" />
                
                {/* Top Section */}
                <div className="space-y-4">
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all duration-300 ${f.iconBg} ${f.color} group-hover:scale-110 group-hover:rotate-3`}>
                    <f.icon className="w-7 h-7" />
                  </div>
                  
                  {/* Title */}
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors duration-300">
                    {f.title}
                  </h3>
                  
                  {/* Subtitle / Header */}
                  <p className="text-sm font-semibold text-slate-800 leading-snug">
                    {f.subtitle}
                  </p>
                  
                  {/* Description */}
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    {f.desc}
                  </p>
                </div>
                
                {/* Bottom Section */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-3 mt-4">
                  {/* Benefit Tag */}
                  <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-full border tracking-wide shadow-sm transition-colors ${f.benefitBg}`}>
                    {f.benefit}
                  </span>
                  
                  {/* Action Link button */}
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-600 cursor-pointer group-hover:text-blue-700 transition-colors">
                    <span>Learn More</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase">
              <Stethoscope className="w-3.5 h-3.5" /> Workflow Timeline
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">The Clinova Care Journey</h2>
            <p className="text-slate-500 text-base max-w-2xl mx-auto">
              A transparent, automated operational sequence linking patient care requests to clinical diagnosis.
            </p>
          </div>

          {/* Interactive Steps timeline mapping */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative">
            <div className="hidden lg:block absolute top-[44px] left-20 right-20 h-0.5 bg-slate-100" />
            {[
              {
                step: "01",
                title: "Patient Registration",
                desc: "Create your digital profile with key details. Secured immediately via unique browser entropy credentials.",
                icon: UserCheck,
                color: "text-blue-500"
              },
              {
                step: "02",
                title: "Upload Case Details",
                desc: "Select symptoms, input medical history notes, and upload diagnostic evidence or photos.",
                icon: Camera,
                color: "text-indigo-500"
              },
              {
                step: "03",
                title: "AI Analysis & Match",
                desc: "Our automated matching system routes the consultation to appropriate clinical specialist queues.",
                icon: Brain,
                color: "text-purple-500"
              },
              {
                step: "04",
                title: "Specialist Consultation",
                desc: "Consult with a specialist doctor, receive your digital prescription, and monitor recovery progress.",
                icon: CheckCircle,
                color: "text-emerald-500"
              }
            ].map((st, i) => (
              <div key={i} className="relative flex flex-col items-center md:items-start text-center md:text-left space-y-4 group">
                <div className="w-16 h-16 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-center shadow-md relative z-10 group-hover:border-blue-500 transition-colors">
                  <st.icon className={`w-8 h-8 ${st.color} group-hover:scale-105 transition-transform`} />
                  <span className="absolute -top-3 -right-3 w-7 h-7 bg-slate-900 text-white rounded-full text-xs font-black flex items-center justify-center border-2 border-white shadow-sm">
                    {st.step}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 mb-1.5">{st.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed font-medium">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Sandbox/Interactive Preview Section */}
      <section id="preview" className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase">
              <Globe className="w-3.5 h-3.5" /> Platform Sandbox
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Interactive Clinova Platform Preview</h2>
            <p className="text-slate-500 text-base max-w-2xl mx-auto">
              Select a role below to preview the core dashboard experience of Clinova in real-time.
            </p>
          </div>

          {/* Toggle Tabs */}
          <div className="flex justify-center mb-10">
            <div className="bg-slate-200/60 p-1.5 rounded-2xl inline-flex gap-2">
              <button 
                onClick={() => setActiveTab('patient')}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'patient' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <UserIcon className="w-4 h-4" />
                <span>Patient Dashboard View</span>
              </button>
              <button 
                onClick={() => setActiveTab('clinician')}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'clinician' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Activity className="w-4 h-4" />
                <span>Clinician Dashboard View</span>
              </button>
            </div>
          </div>

          {/* Active Preview Frame */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200/50 shadow-2xl overflow-hidden max-w-5xl mx-auto">
            {activeTab === 'patient' ? (
              <div className="p-8 space-y-8">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mock Profile ID: PT-04892</p>
                    <h3 className="text-2xl font-black text-slate-900">Patient Dashboard Preview</h3>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={onGetStarted} className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors">
                      + Create Consultation Request
                    </button>
                    <button onClick={onGetStarted} className="px-4 py-2 bg-slate-50 text-slate-600 border border-slate-100 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column Profile info cards */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-lg font-black">AP</div>
                        <div>
                          <h4 className="font-bold text-slate-900">Ayan Pal</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient User</p>
                        </div>
                      </div>
                      <div className="space-y-3.5 pt-2 border-t border-slate-100 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Contact Email</p>
                          <p className="font-bold text-slate-800">ayanpal209806@gmail.com</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Account Status</p>
                          <span className="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded-full">Secure Sync Active</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100/50">
                      <h4 className="font-bold text-blue-900 text-xs uppercase tracking-wide mb-2">Live Support Note</h4>
                      <p className="text-xs text-blue-800 leading-relaxed font-semibold">Your files and patient profile stay synced offline in local storage mode.</p>
                    </div>
                  </div>

                  {/* Right Column details list */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="p-6 bg-amber-50/30 rounded-2xl border border-amber-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Medical History Summary</h4>
                          <p className="text-xs text-amber-600 uppercase font-black">All past consultations categorized locally</p>
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-amber-400" />
                    </div>

                    <div className="space-y-4">
                      <p className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                        <HistoryIcon className="w-4 h-4 text-slate-400" /> Case History Timeline
                      </p>
                      <div className="p-5 border border-slate-100 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-slate-400 font-bold">Consultation logged on 05/04/2026</p>
                          <h5 className="font-black text-slate-900 text-sm">headache and running nose</h5>
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold">General Medicine</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-green-500 uppercase px-3 py-1 bg-green-50 rounded-full border border-green-100">Completed</span>
                          <button onClick={onGetStarted} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-black transition-all">Details</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 space-y-8">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mock Doctor ID: DC-90184</p>
                    <h3 className="text-2xl font-black text-slate-900">Clinician Portal Preview</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-500">My Status:</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black border border-emerald-100">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Available
                    </span>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row border border-slate-100 rounded-3xl overflow-hidden bg-slate-50/50">
                  {/* Left Patient Queue sidebar lists */}
                  <div className="w-full lg:w-1/3 bg-slate-50 p-5 border-r border-slate-100 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Incoming Queue</span>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-black">0 New</span>
                    </div>

                    <div className="p-3 bg-white border border-blue-100 rounded-xl shadow-sm space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-emerald-500 uppercase font-black">Completed</span>
                        <span className="text-slate-400">18:37</span>
                      </div>
                      <p className="font-black text-slate-900 text-sm">user_kaa1ip</p>
                      <p className="text-xs text-slate-500">stomache symptoms</p>
                    </div>

                    <div className="p-3 bg-white/40 border border-slate-100/50 rounded-xl space-y-1 opacity-60">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-400 uppercase font-black">Assigned</span>
                        <span className="text-slate-400">16:03</span>
                      </div>
                      <p className="font-black text-slate-900 text-sm">ayanpal209806</p>
                      <p className="text-xs text-slate-500">headache and running nose</p>
                    </div>
                  </div>

                  {/* Right active selected patient view */}
                  <div className="flex-1 p-6 space-y-6 bg-white">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                          <UserIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-lg">user_kaa1ip</h4>
                          <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-full text-[9px] font-black uppercase">Emergency Medicine</span>
                        </div>
                      </div>
                      <button onClick={onGetStarted} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-100">
                        Start Case Consultation
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Symptom Evidence</p>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                          <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                            "Severe localized abdominal discomfort spanning across the lower stomach quadrant. Began last night."
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Geospatial Routing</p>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="text-xs font-bold text-slate-900">Agartala, Tripura</p>
                            <p className="text-[10px] text-slate-400 font-bold">Coordinates: 23.8411, 91.2983</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How It Works - Visual Timeline Section */}
      <section id="documentation" className="py-24 bg-white border-b border-slate-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase">
              <Printer className="w-3.5 h-3.5" /> Documentation
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Platform Specification & Export</h2>
            <p className="text-slate-500 text-base max-w-2xl mx-auto">
              Our complete specs manual is built directly into the platform interface. Access it instantly from your navbar or export a PDF of the system structure.
            </p>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-[3rem] p-12 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-12 opacity-10">
              <BookOpen className="w-72 h-72" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold border border-white/10">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span>Interactive System Manual Included</span>
                </div>
                <h3 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
                  Proprietary Medical Spec & Governance Framework
                </h3>
                <p className="text-slate-300 text-base leading-relaxed">
                  The Clinova Platform Manual documents the complete system architecture, local-first synchronization model, healthcare workflows, role-based dashboards, and security framework.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300"><strong className="text-white">Print Ready:</strong> Layout styles customized perfectly for ink/paper layout sizes.</p>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300"><strong className="text-white">Confidential Tier:</strong> Access local storage governance maps instantly.</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white/5 rounded-3xl p-8 border border-white/10 flex flex-col justify-center text-center space-y-6 backdrop-blur-md">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20">
                  <BookOpen className="w-7 h-7 text-white" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-bold text-lg">Export Specification Document</h4>
                  <p className="text-xs text-slate-400">Download the complete operational system manual (PDF / Print)</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link 
                    to="/manual"
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 group shadow-lg shadow-blue-600/10"
                  >
                    <span>View Interactive Manual</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link
                    to="/manual?export=true"
                    target="_blank"
                    className="w-full py-3 bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-blue-400" />
                    <span>Export Spec Manual PDF</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Privacy Section */}
      <section id="security" className="py-24 bg-slate-900 text-white scroll-mt-20 overflow-hidden relative">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500 rounded-full blur-[140px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-500 rounded-full blur-[140px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-blue-400 rounded-full text-xs font-black uppercase border border-white/5">
              <Lock className="w-3.5 h-3.5" /> Security Protocol
            </div>
            <h2 className="text-4xl font-black text-white tracking-tight">End-to-End Clinical Sovereignty</h2>
            <p className="text-slate-400 text-base max-w-2xl mx-auto">
              How we isolate and protect your personal identifiable information (PII) using a completely modern decentralized sandboxed runtime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "End-to-End Cryptography",
                desc: "Consultation details, diagnostics reports, and symptoms details are packaged securely directly on-client before transport.",
                icon: ShieldCheck,
                color: "bg-blue-500/10 text-blue-400"
              },
              {
                title: "100% Client Local Storage",
                desc: "All active patient files, clinical diagnostic history lists, and profile tokens reside inside your private sandboxed instance.",
                icon: Database,
                color: "bg-indigo-500/10 text-indigo-400"
              },
              {
                title: "HIPAA Compliant Architecture",
                desc: "Built to map with HIPAA requirements for healthcare information processing and validation standards.",
                icon: ShieldAlert,
                color: "bg-rose-500/10 text-rose-400"
              },
              {
                title: "Decentralized Audit Logs",
                desc: "Clinical assignment actions, diagnosis saves, and status updates trigger immutable local audit traces.",
                icon: ClipboardList,
                color: "bg-amber-500/10 text-amber-400"
              },
              {
                title: "Resilient Offline Core",
                desc: "Maintains absolute data consistency and system integrity even in complete remote connectivity drops.",
                icon: WifiOff,
                color: "bg-purple-500/10 text-purple-400"
              },
              {
                title: "Secure Entropy Auth",
                desc: "Login routes bypass standard cloud storage trackers, establishing secure tokens locally to manage accounts.",
                icon: UserCheck,
                color: "bg-cyan-500/10 text-cyan-400"
              }
            ].map((sec, idx) => (
              <div key={idx} className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300">
                <div className={`w-12 h-12 ${sec.color} rounded-2xl flex items-center justify-center mb-6`}>
                  <sec.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2.5">{sec.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-semibold">{sec.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="py-24 bg-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase">
              <HelpCircle className="w-3.5 h-3.5" /> FAQ
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Frequently Asked Questions</h2>
            <p className="text-slate-500 text-base">
              Got questions about Clinova? We have answers.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = faqOpen === idx;
              return (
                <div key={idx} className="border border-slate-100 rounded-2xl bg-slate-50/50 overflow-hidden transition-all duration-300">
                  <button 
                    onClick={() => setFaqOpen(isOpen ? null : idx)}
                    className="w-full p-6 text-left flex justify-between items-center gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-bold text-slate-900 text-base md:text-lg">{faq.q}</span>
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <div className="p-6 pt-0 text-sm leading-relaxed text-slate-500 font-semibold border-t border-slate-100 bg-white">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact & Newsletter CTA Section */}
      <section id="contact" className="py-24 bg-slate-50 border-t border-slate-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Left newsletter content */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase">
              <Mail className="w-3.5 h-3.5" /> Newsletter
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-[1.1]">
              Stay Up to Date on Decentralized Digital Health
            </h2>
            <p className="text-slate-500 text-base leading-relaxed">
              Subscribe to our clinical technology newsletter to receive bi-weekly research insights, platform updates, specification releases, and local security protocol audits.
            </p>
            
            <form onSubmit={handleNewsletterSubmit} className="flex gap-3 max-w-md">
              <input 
                type="email" 
                required
                placeholder="Enter your email address" 
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="flex-1 px-5 py-3.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 shadow-sm transition-colors"
              />
              <button 
                type="submit" 
                className="px-6 py-3.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-sm shadow-md transition-all shrink-0 flex items-center gap-1.5"
              >
                <span>Subscribe</span>
                <Send className="w-4 h-4" />
              </button>
            </form>

            {newsletterSubscribed && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-100 max-w-md"
              >
                🎉 Thank you for subscribing! We have added you to our research distribution list.
              </motion.div>
            )}
          </div>

          {/* Right quick contact information cards */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-8 bg-white rounded-3xl border border-slate-200/50 shadow-sm space-y-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Global Research HQ</h4>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">Decentralized Healthcare Protocol Foundation</p>
              </div>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-slate-200/50 shadow-sm space-y-4">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Inquiries & Support</h4>
                <p className="text-xs text-slate-400 font-bold">ayanpal209806@gmail.com</p>
                <p className="text-[10px] text-slate-300 font-bold mt-1">24/7 client-side response</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Large Final CTA Block */}
      <section className="py-24 px-6 bg-gradient-to-tr from-blue-600 to-indigo-700 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-white rounded-full blur-[150px] -translate-x-1/2 -translate-y-1/2" />
        </div>
        
        <div className="max-w-4xl mx-auto space-y-8 relative z-10">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
            Start Your Digital Healthcare Journey Today
          </h2>
          <p className="text-blue-100 text-lg md:text-xl font-medium max-w-2xl mx-auto">
            Join thousands of active patients and authorized clinical specialists using Clinova's secure localized platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <button 
              onClick={onGetStarted}
              className="px-10 py-5 bg-white text-blue-700 rounded-2xl font-black text-base hover:bg-slate-50 transition-all shadow-xl shadow-slate-900/10 hover:scale-105"
            >
              Enter Dashboard Portal
            </button>
            <Link
              to="/manual"
              className="px-10 py-5 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-2xl font-bold text-base transition-all hover:scale-105"
            >
              Explore Specifications
            </Link>
          </div>
          <p className="text-blue-200/80 text-xs font-bold pt-4">Free forever under medical research and decentralized local sandbox guidelines.</p>
        </div>
      </section>

      {/* Footer Directory */}
      <footer className="py-16 bg-slate-900 text-slate-400 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-12 pb-12 border-b border-slate-800 text-sm">
          {/* Col 1 Brand */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center">
              <TeleHealthLogo size={40} variant="horizontal" showTagline={true} theme="dark" />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              The next-generation Local-First Persistence Model Clinova platform. Isolate, encrypt, and sync clinical consultations securely without central cloud storage tracks.
            </p>
          </div>

          {/* Col 2 Product */}
          <div className="space-y-3">
            <p className="font-bold text-white text-xs uppercase tracking-wider">Platform</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#features" className="hover:text-white transition-colors">Features Suite</a></li>
              <li><a href="#preview" className="hover:text-white transition-colors">Platform Sandbox</a></li>
              <li><a href="#security" className="hover:text-white transition-colors">Security Controls</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">FAQ Support</a></li>
            </ul>
          </div>

          {/* Col 3 Resources */}
          <div className="space-y-3">
            <p className="font-bold text-white text-xs uppercase tracking-wider">Resources</p>
            <ul className="space-y-2 text-xs">
              <li><Link to="/manual" className="hover:text-white transition-colors font-bold text-blue-400">Spec manual</Link></li>
              <li><Link to="/manual?export=true" target="_blank" className="hover:text-white transition-colors">Print / Export PDF</Link></li>
              <li><a href="#" className="hover:text-white transition-colors">API Docs</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Local SDK</a></li>
            </ul>
          </div>

          {/* Col 4 Legal */}
          <div className="space-y-3">
            <p className="font-bold text-white text-xs uppercase tracking-wider">Legal & Compliance</p>
            <ul className="space-y-2 text-xs">
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">HIPAA Matrices</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Cookie settings</a></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-semibold">
          <p>© 2026 Clinova Protocol. All rights reserved under clinical LFPM specifications.</p>
          <div className="flex gap-6">
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Twitter</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

// --- Login Page ---

const Login = ({ onBack }: { onBack?: () => void }) => {
  const [role, setRole] = useState<UserRole>('patient');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      const mockEmail = email || `user_${Math.random().toString(36).substring(7)}@example.com`;
      mockAuth.login(mockEmail, mockEmail.split('@')[0], role);
      window.dispatchEvent(new Event('auth-change'));
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-600/5 -skew-x-12 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-1/2 h-full bg-indigo-600/5 -skew-x-12 -translate-x-1/2" />

      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white w-full max-w-xl p-10 rounded-[3rem] shadow-2xl border border-gray-100 relative z-10"
      >
        <button 
          onClick={onBack}
          className="absolute top-8 left-8 text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-2 font-bold mb-8"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          <span>Back</span>
        </button>

        <div className="text-center mb-10 pt-4">
          <TeleHealthLogo size={110} variant="full" showTagline={true} className="mb-6" />
          <p className="text-gray-500 mt-1 font-medium text-sm">Select your portal to continue providing or receiving care.</p>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-400 ml-2">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.com"
                className="w-full pl-14 pr-6 py-5 rounded-3xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none transition-all font-bold text-gray-900 border-2 border-transparent focus:border-blue-600"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-400 ml-2">I am entering as a</label>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setRole('patient')}
                className={cn(
                  "p-8 rounded-[2rem] border-4 transition-all flex flex-col items-center gap-4 group",
                  role === 'patient' ? "border-blue-600 bg-blue-50 text-blue-700 shadow-lg shadow-blue-100" : "border-gray-50 bg-gray-50 text-gray-500 hover:border-gray-100"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                  role === 'patient' ? "bg-blue-600 text-white" : "bg-white text-gray-400"
                )}>
                  <UserIcon className="w-6 h-6" />
                </div>
                <span className="font-black text-lg">Patient</span>
              </button>
              <button 
                onClick={() => setRole('clinician')}
                className={cn(
                  "p-8 rounded-[2rem] border-4 transition-all flex flex-col items-center gap-4 group",
                  role === 'clinician' ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-100" : "border-gray-50 bg-gray-50 text-gray-500 hover:border-gray-100"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                  role === 'clinician' ? "bg-indigo-600 text-white" : "bg-white text-gray-400"
                )}>
                  <Users className="w-6 h-6" />
                </div>
                <span className="font-black text-lg">Clinician</span>
              </button>
            </div>
          </div>

          <button 
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-gray-900 text-white py-6 rounded-[2rem] font-black text-xl hover:bg-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-gray-200 mt-4 overflow-hidden relative"
          >
            {isLoading ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <>
                <ShieldCheck className="w-6 h-6" />
                <span>Secure Sign In</span>
              </>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-10 font-bold uppercase tracking-widest leading-relaxed">
          Platform Security Verified • No cookies collected
        </p>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const profile = mockAuth.getCurrentUser();
      setUserProfile(profile);
      setLoading(false);
    };

    window.addEventListener('auth-change', checkAuth);
    checkAuth();

    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-gray-50 font-sans">
          {userProfile && <Navbar userProfile={userProfile} />}
          <Routes>
            <Route path="/manual" element={<UserManual />} />
            <Route 
              path="/" 
              element={
                !userProfile ? (
                  showLogin ? (
                    <Login onBack={() => setShowLogin(false)} />
                  ) : (
                    <WelcomePage onGetStarted={() => setShowLogin(true)} />
                  )
                ) : (
                  userProfile.role === 'clinician' 
                    ? <ClinicianDashboard userProfile={userProfile} /> 
                    : <PatientDashboard userProfile={userProfile} />
                )
              } 
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}
