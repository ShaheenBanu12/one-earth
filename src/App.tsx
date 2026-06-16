import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect } from "react";
import { 
  Leaf, 
  CheckCircle2, 
  ArrowRight, 
  Globe, 
  Clock, 
  FileText, 
  Users, 
  Mail, 
  MapPin, 
  Calendar,
  Zap,
  BarChart3,
  Loader2,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Undo2,
  ShieldCheck,
  Settings
} from "lucide-react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isBefore,
  startOfToday,
  startOfDay,
  setHours,
  setMinutes,
  setYear,
  setMonth
} from "date-fns";

import { auth, loginWithGoogle, logout, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  query,
  where,
  onSnapshot,
  collection, 
  addDoc, 
  deleteDoc,
  doc,
  serverTimestamp 
} from "firebase/firestore";



function AdminPinPromptModal({
  isOpen,
  onClose,
  onSubmit,
  pinInput,
  setPinInput,
  errorMessage,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  pinInput: string;
  setPinInput: (val: string) => void;
  errorMessage: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 sm:p-0">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-primary/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-[32px] p-8 md:p-12 w-full max-w-md shadow-2xl overflow-hidden text-brand-primary"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-brand-sage" />
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-brand-sage/10 flex items-center justify-center text-brand-sage">
            <ShieldCheck className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-3xl font-serif italic text-brand-primary">Admin <span className="not-italic">Access</span></h3>
            <p className="text-xs text-brand-primary/50 tracking-wider uppercase font-bold">Enter PIN to toggle days off & manage bookings</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="w-full space-y-4">
            <input 
              type="password"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full text-center tracking-[1em] text-2xl font-bold py-4 bg-brand-bg/50 border border-brand-border rounded-xl focus:outline-none focus:border-brand-sage"
              autoFocus
            />
            
            {errorMessage && (
              <p className="text-red-500 font-bold text-[10px] uppercase tracking-wider">{errorMessage}</p>
            )}

            <div className="flex gap-4 pt-2">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-brand-border hover:bg-brand-bg transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 px-6 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-sage shadow-lg shadow-brand-primary/20 transition-all"
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function AdminAlertModal({
  isOpen,
  onClose,
  title,
  message,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 sm:p-0">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-primary/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-[32px] p-8 md:p-12 w-full max-w-sm shadow-2xl overflow-hidden text-brand-primary"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-brand-sage" />
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-brand-sage/10 flex items-center justify-center text-brand-sage">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          
          <div className="space-y-4">
            <h3 className="text-2xl font-serif italic text-brand-primary">{title}</h3>
            <p className="text-xs text-brand-primary/60 leading-relaxed font-medium uppercase tracking-wider">{message}</p>
          </div>

          <button 
            onClick={onClose}
            className="w-full px-6 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-sage shadow-lg shadow-brand-primary/20 transition-all"
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
}


function BookingModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  date, 
  time,
  service
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  date: Date, 
  time: string,
  service: string
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-0">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-brand-primary/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-[32px] p-8 md:p-12 w-full max-w-lg shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-brand-sage" />
        
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-brand-sage/10 flex items-center justify-center text-brand-sage">
            <Calendar className="w-8 h-8" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-3xl font-serif italic text-brand-primary">Confirm <span className="not-italic">Booking</span></h3>
            <p className="text-sm text-brand-primary/50">You are about to book a session for:</p>
          </div>

          <div className="w-full bg-brand-bg rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-primary">Service</span>
              <span className="text-sm font-bold text-brand-sage">{service}</span>
            </div>
            <div className="flex items-center justify-between border-b border-brand-border pb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-primary">Date</span>
              <span className="text-sm font-bold text-brand-primary">{format(date, "EEEE, MMMM do, yyyy")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-primary">Time</span>
              <span className="text-sm font-bold text-brand-primary">{time}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full pt-4">
            <button 
              onClick={onClose}
              className="flex-1 px-8 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-brand-border hover:bg-brand-bg transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 px-8 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-sage shadow-lg shadow-brand-primary/20 transition-all"
            >
              Confirm Booking
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ModernBookingSystem({ 
  onSelectSlot, 
  busySlots, 
  holidays,
  onToggleHoliday,
  isAdmin 
}: { 
  onSelectSlot: (date: Date, time: string, service: string) => void, 
  busySlots: {date: string, time: string}[], 
  holidays: {id: string, date: string}[],
  onToggleHoliday?: (date: Date) => void,
  isAdmin: boolean 
}) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [confirmingSlot, setConfirmingSlot] = useState<{date: Date, time: string} | null>(null);

  const services = [
    { title: "Free Consultation", duration: "30 Min", id: "free" }
  ];
  const selectedService = 0;

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const getTimes = (serviceId: string) => {
    return [
      "11:00 AM - 11:30 AM",
      "11:30 AM - 12:00 PM",
      "12:00 PM - 12:30 PM",
      "12:30 PM - 01:00 PM",
      "01:00 PM - 01:30 PM",
      "01:30 PM - 02:00 PM"
    ];
  };

  const times = getTimes(services[selectedService].id);

  const isDeveloperOnLeave = (date: Date) => {
    const dStr = format(date, "yyyy-MM-dd");
    return holidays.some(h => h.date === dStr);
  };

  const handleDateClick = (day: Date) => {
    if (isBefore(startOfDay(day), startOfDay(new Date()))) return;
    if (isDeveloperOnLeave(day) && !isAdmin) return;
    setSelectedDate(prev => prev && isSameDay(day, prev) ? null : day);
  };

  const isSlotBusy = (date: Date, time: string) => {
    const dStr = format(date, "yyyy-MM-dd");
    return busySlots.some(s => s.date === dStr && s.time === time);
  };

  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() + i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handleYearChange = (year: number) => {
    setCurrentMonth(setYear(currentMonth, year));
  };

  const handleMonthChange = (monthIdx: number) => {
    setCurrentMonth(setMonth(currentMonth, monthIdx));
  };

  return (
    <div className="space-y-12">
      <div className="flex justify-center">
        <div className="bg-brand-sage/10 border border-brand-sage/20 px-8 py-5 rounded-[24px] text-center max-w-md w-full shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-sage">Current Booking Service</span>
          <h4 className="text-xl font-serif italic text-brand-primary mt-1">Free Consultation — <span className="not-italic">30 Min</span></h4>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-brand-border overflow-hidden shadow-sm flex flex-col lg:flex-row">
        {/* Calendar Section */}
        <div className="lg:w-7/12 p-8 md:p-12 border-b lg:border-b-0 lg:border-r border-brand-border bg-brand-bg/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div className="space-y-1">
              <h3 className="text-3xl font-serif italic text-brand-primary">Select <span className="not-italic">Date</span></h3>
              <div className="flex items-center gap-2">
                <select 
                  value={currentMonth.getMonth()} 
                  onChange={(e) => handleMonthChange(parseInt(e.target.value))}
                  className="bg-transparent text-sm font-bold uppercase tracking-widest text-brand-sage focus:outline-none cursor-pointer hover:opacity-70"
                >
                  {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select 
                  value={currentMonth.getFullYear()} 
                  onChange={(e) => handleYearChange(parseInt(e.target.value))}
                  className="bg-transparent text-sm font-bold uppercase tracking-widest text-brand-sage focus:outline-none cursor-pointer hover:opacity-70"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-brand-border hover:bg-white transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="w-10 h-10 flex items-center justify-center rounded-full border border-brand-border hover:bg-white transition-all shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-3 gap-x-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <div key={idx} className="text-[10px] font-bold text-center opacity-30 uppercase tracking-widest mb-4">{d}</div>
            ))}
            {days.map((day, i) => {
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
              const onLeave = isDeveloperOnLeave(day);
              
              return (
                <button
                  key={i}
                  disabled={isPast || (!isAdmin && onLeave)}
                  onClick={() => handleDateClick(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center text-sm rounded-2xl transition-all relative
                    ${!isCurrentMonth ? "opacity-10" : ""}
                    ${isPast ? "bg-brand-bg opacity-20 cursor-not-allowed group" : ""}
                    ${!isPast && onLeave ? (isAdmin ? "ring-2 ring-brand-sage/50 bg-brand-sage/5" : "bg-gray-100 opacity-60 cursor-not-allowed group") : ""}
                    ${!isPast && !onLeave ? "hover:bg-brand-sage hover:text-white cursor-pointer group" : ""}
                    ${isSelected ? "bg-brand-primary text-white font-bold scale-105 shadow-xl z-10" : "text-brand-primary shadow-sm hover:shadow-md"}
                  `}
                >
                  <span className="relative z-10">{format(day, "d")}</span>
                  {onLeave && !isPast && (
                    <span className={`absolute bottom-1 text-[6px] font-bold uppercase tracking-tighter opacity-40 ${isSelected ? "text-white opacity-60" : ""}`}>
                      {isAdmin ? "Day Off" : "Closed"}
                    </span>
                  )}
                  {isAdmin && !isPast && !onLeave && isSelected && (
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           onToggleHoliday?.(day);
                         }}
                         className="absolute top-1 right-1 bg-white/20 p-1 rounded-full hover:bg-white/40 transition-colors"
                         title="Mark as Day Off"
                       >
                         <Calendar className="w-3 h-3" />
                       </button>
                    )}
                    {isAdmin && onLeave && isSelected && (
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           onToggleHoliday?.(day);
                         }}
                         className="absolute top-1 right-1 bg-brand-sage p-1 rounded-full hover:opacity-80 transition-opacity"
                         title="Remove Day Off"
                       >
                         <CheckCircle2 className="w-3 h-3" />
                       </button>
                    )}
                  {isSelected && (
                    <motion.div layoutId="active-date-glow" className="absolute inset-0 bg-brand-primary rounded-2xl" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Slot Section */}
        <div className="lg:w-5/12 p-8 md:p-12 flex flex-col">
          <div className="mb-10 text-center lg:text-left">
            <h3 className="text-3xl font-serif italic text-brand-primary">Select <span className="not-italic">Time</span></h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-sage opacity-60 font-medium">
              {selectedDate ? format(selectedDate, "EEEE, MMM do") : "Please select a date"}
            </p>
          </div>

          {isAdmin && selectedDate && (
            <div className="mb-6 p-5 bg-brand-sage/10 rounded-2xl border border-brand-sage/30 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
              <div className="text-center sm:text-left space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-sage">Availability Status</span>
                <p className="text-sm font-bold text-brand-primary">
                  {isDeveloperOnLeave(selectedDate) ? "Marked as Closed / Day Off" : "Available for Bookings"}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHoliday?.(selectedDate);
                }}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${
                  isDeveloperOnLeave(selectedDate)
                    ? "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200"
                    : "bg-brand-sage text-white hover:bg-brand-primary"
                }`}
              >
                {isDeveloperOnLeave(selectedDate) ? "Remove Day Off" : "Mark as Day Off"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[400px] pr-2 scrollbar-hide">
            {selectedDate ? times.map((time, idx) => {
              const busy = isSlotBusy(selectedDate, time);
              return (
                <button
                  key={idx}
                  disabled={busy}
                  onClick={() => setConfirmingSlot({ date: selectedDate, time })}
                  className={`
                    w-full py-5 px-8 rounded-2xl text-xs font-bold transition-all border flex items-center justify-between group
                    ${busy 
                      ? "bg-gray-100 border-transparent text-brand-primary/40 cursor-not-allowed grayscale" 
                      : "bg-white border-brand-border hover:border-brand-primary hover:bg-brand-primary hover:text-white text-brand-primary shadow-sm hover:shadow-md"}
                  `}
                >
                  <div className="flex items-center gap-4">
                    {busy ? <X className="w-3 h-3 opacity-20" /> : <div className="w-1.5 h-1.5 rounded-full bg-brand-sage group-hover:bg-brand-bg transition-colors" />}
                    <span className={busy ? "line-through opacity-40" : ""}>{time}</span>
                  </div>
                  {busy ? (
                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-20">Booked</span>
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  )}
                </button>
              );
            }) : (
              <div className="flex flex-col items-center justify-center flex-grow py-12 text-center space-y-4 opacity-30">
                <Calendar className="w-10 h-10" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Select a date to <br/> see availability</p>
              </div>
            )}
          </div>

          <div className="mt-auto pt-8 border-t border-brand-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 opacity-30 grayscale ml-auto">
              <Globe className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Timezone: BST</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {confirmingSlot && (
          <BookingModal 
            isOpen={!!confirmingSlot}
            onClose={() => setConfirmingSlot(null)}
            onConfirm={() => {
              if (confirmingSlot) {
                onSelectSlot(confirmingSlot.date, confirmingSlot.time, services[selectedService].title);
                setConfirmingSlot(null);
              }
            }}
            date={confirmingSlot.date}
            time={confirmingSlot.time}
            service={services[selectedService].title}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const getGoogleCalendarUrl = (dateStr: string, timeStr: string, serviceTitle: string) => {
  try {
    const ymd = dateStr.replace(/-/g, ""); // "20260527"
    const parts = timeStr.split("-").map(p => p.trim());
    const startTimeStr = parts[0];
    const endTimeStr = parts[1] || null;

    const parseTime = (str: string) => {
      const match = str.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
      if (!match) return null;
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const start = parseTime(startTimeStr);
    if (!start) return null;

    const pad = (n: number) => String(n).padStart(2, "0");
    const startHM = `${pad(start.hours)}${pad(start.minutes)}00`;

    let endHM = "";
    if (endTimeStr) {
      const end = parseTime(endTimeStr);
      if (end) {
        endHM = `${pad(end.hours)}${pad(end.minutes)}00`;
      }
    }

    if (!endHM) {
      // Fallback 30 min duration
      let endHours = start.hours;
      let endMinutes = start.minutes + 30;
      if (endMinutes >= 60) {
        endMinutes -= 60;
        endHours = (endHours + 1) % 24;
      }
      endHM = `${pad(endHours)}${pad(endMinutes)}00`;
    }

    const startField = `${ymd}T${startHM}`;
    const endField = `${ymd}T${endHM}`;
    
    const title = encodeURIComponent(`One Earth Sustainability - ${serviceTitle}`);
    const details = encodeURIComponent(`Thank you for booking a ${serviceTitle} with One Earth. We look forward to speaking with you!\n\nDate: ${dateStr}\nTime: ${timeStr} (Europe/London)\n\nBecause every action counts.`);
    const location = encodeURIComponent("Online (Google Meet link to be provided)");
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startField}%2F${endField}&details=${details}&location=${location}&ctz=Europe/London`;
  } catch (err) {
    console.error("Error building Google Calendar URL:", err);
    return null;
  }
};

function SuccessModal({ 
  isOpen, 
  onClose,
  bookedSlot
}: { 
  isOpen: boolean, 
  onClose: () => void,
  bookedSlot?: { date: string; time: string; service: string; } | null
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-brand-primary/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-[40px] p-10 md:p-14 w-full max-w-xl shadow-2xl text-center space-y-8"
      >
        <div className="w-20 h-20 rounded-full bg-brand-sage text-white flex items-center justify-center mx-auto shadow-xl shadow-brand-sage/20">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        
        <div className="space-y-4">
          <h3 className="text-4xl font-serif italic text-brand-primary">Message <span className="not-italic">Received</span></h3>
          <p className="text-lg text-brand-primary/60 leading-relaxed max-w-sm mx-auto">
            Your message has been received. Kindly check your email.
          </p>
        </div>

        {bookedSlot && (
          <div className="bg-brand-sage/5 border border-brand-sage/20 rounded-3xl p-6 space-y-4 animate-in fade-in duration-500 text-left">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-sage">Your Scheduled Slot</h4>
            <div className="space-y-1">
              <p className="text-base font-bold text-brand-primary">{bookedSlot.service}</p>
              <p className="text-xs font-semibold text-brand-primary/70">
                📅 {bookedSlot.date} at {bookedSlot.time} (BST)
              </p>
            </div>
          </div>
        )}

        <button 
          onClick={onClose}
          className="w-full bg-brand-primary text-white py-5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-brand-sage transition-all shadow-lg"
        >
          Return to Website
        </button>
      </motion.div>
    </div>
  );
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

// Main Component
export default function App() {
  const [isAdminMode, setIsAdminMode] = useState(() => {
    return localStorage.getItem("oneearth_admin_active") === "true";
  });
  const [isAdminPromptOpen, setIsAdminPromptOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminPromptError, setAdminPromptError] = useState("");
  const [adminAlert, setAdminAlert] = useState<{ title: string; message: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<React.ReactNode | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [busySlots, setBusySlots] = useState<{id?: string, date: string, time: string, userId?: string}[]>([]);
  const [holidays, setHolidays] = useState<{id: string, date: string}[]>([]);
  const [bookedSlotDetails, setBookedSlotDetails] = useState<{
    date: string;
    time: string;
    service: string;
  } | null>(null);

  
  const handleToggleAdminMode = () => {
    const active = localStorage.getItem("oneearth_admin_active") === "true";
    if (active) {
      setIsAdminMode(false);
      localStorage.removeItem("oneearth_admin_active");
      setAdminAlert({
        title: "Admin Mode Deactivated",
        message: "You have exited Admin Mode successfully."
      });
    } else {
      setAdminPinInput("");
      setAdminPromptError("");
      setIsAdminPromptOpen(true);
    }
  };

  const handleAdminPinSubmit = () => {
    if (adminPinInput === "1212") {
      setIsAdminMode(true);
      localStorage.setItem("oneearth_admin_active", "true");
      setIsAdminPromptOpen(false);
      setAdminPinInput("");
      setAdminPromptError("");
      setAdminAlert({
        title: "Admin Mode Activated",
        message: "You can now manage client bookings and days off. Select any date on the calendar to mark or remove days off in one click."
      });
    } else {
      setAdminPromptError("Incorrect PIN. Please try again.");
    }
  };

  // Secret URL trigger check on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin")) {
      // Clean query parameter from address bar immediately
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      const active = localStorage.getItem("oneearth_admin_active") === "true";
      if (!active) {
        setAdminPinInput("");
        setAdminPromptError("");
        setIsAdminPromptOpen(true);
      }
    }
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    businessName: "",
    email: "",
    phone: "",
    subject: "Starter Pack Inquiry",
    message: "",
    website_verify: ""
  });

  const handleSlotSelect = (date: Date, time: string, service: string) => {
    const formattedDate = format(date, "MMMM do");
    setBookedSlotDetails({
      date: format(date, "yyyy-MM-dd"),
      time,
      service
    });
    setFormData(prev => ({
      ...prev,
      subject: service === "Free Consultation" ? "Free 30m Consultation Request" : "Consultation Request",
      message: `I would like to book a ${service} on ${formattedDate} at ${time}.\n\nSelected Slot Detail: Date: ${format(date, "yyyy-MM-dd")}, Time: ${time}, Service: ${service}\n---\n${prev.message}`
    }));
    
    // Smooth scroll to form
    const formElement = document.getElementById("inquiry-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const msgField = document.getElementById("message-field");
        msgField?.focus();
      }, 800);
    }
  };

  // Fetch busy slots
  useEffect(() => {
    const q = query(collection(db, "busy_slots"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const slots: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.date && data.time) {
          slots.push({ id: doc.id, date: data.date, time: data.time, userId: data.userId });
        }
      });
      setBusySlots(slots);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "busy_slots");
    });
    return () => unsubscribe();
  }, []);

  // Fetch holidays
  useEffect(() => {
    const q = query(collection(db, "holidays"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dates: any[] = [];
      snapshot.forEach(doc => {
        dates.push({ id: doc.id, date: doc.data().date });
      });
      setHolidays(dates);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "holidays");
    });
    return () => unsubscribe();
  }, []);

  const handleToggleHoliday = async (date: Date) => {
    if (!isAdminMode) return;
    
    const dStr = format(date, "yyyy-MM-dd");
    const existingHoliday = holidays.find(h => h.date === dStr);

    try {
      if (existingHoliday) {
        await deleteDoc(doc(db, "holidays", existingHoliday.id));
      } else {
        await addDoc(collection(db, "holidays"), {
          date: dStr,
          createdBy: "admin",
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Failed to toggle holiday:", error);
    }
  };

  const handleCancelBooking = async (slotId: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "busy_slots", slotId));
    } catch (error) {
      console.error("Cancel error:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent, subjectOverride?: string) => {
    if (e) e.preventDefault();
    if (formData.website_verify) return; 
    
    try {
      setIsSubmitting(true);
      setSubmitStatus("idle");
      setErrorMessage(null);
      
      const currentSubject = subjectOverride || formData.subject;

      // 1. Save to Firestore (Critical)
      const inquiryDoc = await addDoc(collection(db, "inquiries"), {
        businessName: formData.businessName,
        email: formData.email,
        phone: formData.phone,
        subject: currentSubject,
        message: formData.message,
        status: "pending",
        userId: null,
        createdAt: serverTimestamp()
      });

      // 2. Save to Busy Slots if applicable
      const eventDate = bookedSlotDetails?.date || formData.message?.match(/Selected Slot Detail: Date:\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
      const eventTime = bookedSlotDetails?.time || formData.message?.match(/Time:\s*([^,]+)/i)?.[1]?.trim() || null;

      if ((currentSubject.includes("Consultation") || currentSubject.includes("Session")) && eventDate && eventTime) {
        await addDoc(collection(db, "busy_slots"), {
          date: eventDate,
          time: eventTime,
          userId: null,
          inquiryId: inquiryDoc.id,
          createdAt: serverTimestamp()
        });
      }

      // 3. Send Email Notification (Non-blocking or at least we catch errors)
      try {
        const emailRes = await fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business_name: formData.businessName,
            user_email: formData.email,
            phone: formData.phone,
            subject: currentSubject,
            message: formData.message,
            to_email: "info@oneearth.eco",
            website_verify: formData.website_verify,
            eventDate: eventDate,
            eventTime: eventTime,
            eventService: currentSubject.includes("Free Consultation") ? "Free Consultation" : "Consultation"
          }),
        });
        
        if (!emailRes.ok) {
          const errorData = await emailRes.json();
          console.warn("Email service error:", errorData.error);
          // We don't throw here so the user still sees the "Success" for the booking itself
        }
      } catch (emailErr) {
        console.error("Email fetch failed:", emailErr);
      }
      
      setSubmitStatus("success");
      setFormData({ businessName: "", email: "", phone: "", subject: "Starter Pack Inquiry", message: "", website_verify: "" });
      
    } catch (error: any) {
      console.error("Submission error:", error);
      setErrorMessage(error.message || "Something went wrong. Please try again.");
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBookingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleSubmit(e as any, "Consultation Booking Request");
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutConfirm(false);
  };

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "Starter Pack", href: "#services" },
    { label: "Why", href: "#why" },
    { label: "Contact", href: "#contact" }
  ];

  return (
    <div className="min-h-screen selection:bg-brand-accent/30 selection:text-brand-primary">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-brand-bg/80 backdrop-blur-md z-50 border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 select-none" onDoubleClick={handleToggleAdminMode}>
            <div className="w-8 h-8 bg-brand-sage rounded-full flex items-center justify-center text-white cursor-pointer" title="Double-click logo for Admin option">
              <Leaf className="w-4 h-4" />
            </div>
            <span className="font-serif italic text-xl tracking-tight text-brand-primary cursor-pointer" onClick={() => window.scrollTo(0, 0)}>One Earth</span>
          </div>
          
          <div className="hidden md:flex items-center gap-10 text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-brand-sage transition-colors">{link.label}</a>
            ))}
          </div>
          
            <div className="flex items-center gap-4">
              {isAdminMode && (
                <div className="hidden sm:flex flex-col items-end animate-in fade-in duration-300">
                  <button 
                    onClick={handleToggleAdminMode}
                    className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-2 bg-brand-sage text-white border-brand-sage border"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Admin Active: Deactivate
                  </button>
                </div>
              )}

              <button 
                className="md:hidden p-2 text-brand-primary"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-brand-bg border-b border-brand-border overflow-hidden"
            >
              <div className="px-6 py-8 flex flex-col gap-6 text-sm font-bold uppercase tracking-[0.2em]">
                {navLinks.map((link) => (
                  <a 
                    key={link.href} 
                    href={link.href} 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-brand-primary/60 hover:text-brand-sage transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                {isAdminMode && (
                  <div className="pt-4 border-t border-brand-border animate-in fade-in duration-300">
                    <button 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        handleToggleAdminMode();
                      }}
                      className="w-full py-4 rounded-xl text-[10px] tracking-widest font-bold uppercase transition-all flex items-center justify-center gap-2 bg-brand-sage text-white"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Deactivate Admin Mode
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden border-b border-brand-border">
          <div className="max-w-5xl mx-auto px-6 md:px-12 text-center z-10 py-20">
            <motion.div 
              {...fadeIn}
              className="inline-flex items-center gap-2 mb-6"
            >
              <span className="text-brand-sage font-bold text-xs uppercase tracking-[0.3em]">UK SME Specialist</span>
            </motion.div>
            <motion.h1 
              {...fadeIn}
              transition={{ delay: 0.1, duration: 0.8 }}
              className="text-5xl md:text-8xl font-serif leading-[1.05] mb-10 text-balance"
            >
              Simple, affordable sustainability support for <span className="italic text-brand-sage">UK SMEs.</span>
            </motion.h1>
            <motion.p 
              {...fadeIn}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-lg md:text-xl text-brand-primary/90 mb-12 max-w-3xl mx-auto leading-relaxed font-normal"
            >
              We help small and medium-sized businesses understand their environmental impact, meet growing customer expectations, and take practical steps toward sustainability without complexity, heavy reports, or high consultancy fees.
            </motion.p>
            <motion.div 
              {...fadeIn}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-6 px-4"
            >
              <a href="#contact" className="w-full sm:w-auto bg-brand-primary text-brand-bg px-10 py-4 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-brand-sage transition-all shadow-lg shadow-brand-primary/10 text-center">
                Start Journey
              </a>
              <a href="#services" className="w-full sm:w-auto px-10 py-4 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-primary border border-brand-border hover:bg-brand-soft transition-all text-center">
                View Starter Pack
              </a>
            </motion.div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="py-24 md:py-32 bg-white">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="grid lg:grid-cols-12 gap-16 md:gap-24 items-center">
              <div className="lg:col-span-12 flex flex-col items-center text-center mb-16">
                 <span className="text-brand-sage font-bold text-[10px] uppercase tracking-[0.3em] mb-4">About One Earth</span>
                 <h2 className="text-4xl md:text-7xl font-serif max-w-4xl italic px-4">Sustainability should be accessible, affordable, and actionable for every SME.</h2>
              </div>
              <div className="lg:col-span-6 space-y-10">
                <div className="relative aspect-[4/3] rounded-[40px] overflow-hidden border border-brand-border shadow-2xl group">
                  <img 
                    src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=2013&auto=format&fit=crop" 
                    alt="Sustainable landscape" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-brand-primary/10 group-hover:bg-transparent transition-colors duration-500" />
                </div>
                <div className="bg-brand-soft/20 p-10 rounded-[40px] border border-brand-border relative">
                  <p className="text-lg md:text-xl font-serif italic text-brand-primary/80 leading-relaxed italic">
                    "With a decade of engineering experience, our founder established One Earth to help SMEs take practical, achievable steps toward sustainability without the heavy consultancy fees."
                  </p>
                  <p className="mt-6 text-[9px] uppercase tracking-[0.2em] font-bold opacity-40">Founder & Director, MSc Engineering</p>
                </div>
              </div>
              <div className="lg:col-span-6 space-y-8 text-lg text-brand-primary/80 leading-relaxed font-normal">
                <p>
                  One Earth Limited was created with a clear purpose: to make sustainability simple for every UK small and medium‑sized business. We saw that SMEs wanted to take climate action, but the process felt too technical or expensive.
                </p>
                <p>
                  Our mission is to empower you to measure and reduce your environmental impact using tools grounded in UK standards. From our Carbon Footprint Starter Pack to the One Earth Carbon Calculator, everything is designed for real‑world use, not academic theory.
                </p>
                <p>
                  Today, One Earth stands for accuracy and impact—without jargon. We believe every business can contribute to a sustainable future, and we’re here to make that journey achievable.
                </p>
                <div className="flex items-center gap-2 pt-4">
                  <Leaf className="w-5 h-5 text-brand-sage" />
                  <span className="font-serif italic text-xl text-brand-sage">Because every action counts.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Starter Pack Section */}
        <section id="services" className="py-24 md:py-32 border-t border-brand-border bg-brand-bg">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-8">
              <div className="max-w-2xl">
                <span className="text-brand-sage font-bold text-xs uppercase tracking-[0.3em] mb-4 block">The Starter Pack</span>
                <h2 className="text-4xl md:text-6xl font-serif leading-tight">A complete, beginner-friendly <span className="italic">package.</span></h2>
              </div>
              <p className="text-brand-primary/80 max-w-sm text-[10px] uppercase tracking-[0.2em] font-bold leading-relaxed">
                Designed specifically for SMEs wanting to respond to customer requests and prepare for future requirements.
              </p>
            </div>

            <motion.div 
              variants={staggerChildren}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {[
                { id: "1", title: "Carbon Footprint", icon: BarChart3, desc: "Scopes 1-3 report using official DESNZ factors." },
                { id: "2", title: "ESG Snapshot", icon: FileText, desc: "ESG Snapshot (Lite) to assess your broader impact." },
                { id: "3", title: "2 Hour Consultation", icon: Clock, desc: "Direct consultation time to guide your strategy." },
                { id: "4", title: "12-Month Action Plan", icon: Calendar, desc: "Guided roadmap for practical sustainability steps." },
                { id: "5", title: "Follow-Up Support", icon: CheckCircle2, desc: "Optional follow-up to ensure continued progress." }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  variants={fadeIn}
                  className="bg-white p-10 rounded-[40px] border border-brand-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group overflow-hidden relative"
                >
                  <div className="absolute top-0 left-0 p-6 opacity-10 font-serif text-6xl tracking-tighter italic pointer-events-none group-hover:opacity-20 transition-opacity">
                    0{item.id}
                  </div>
                  <div className="w-12 h-12 bg-brand-soft text-brand-sage rounded-2xl flex items-center justify-center mb-8 relative z-10">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-serif mb-4 italic relative z-10">{item.title}</h3>
                  <p className="text-brand-primary/80 leading-relaxed font-normal relative z-10">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            <div className="mt-12 bg-brand-primary text-brand-bg p-8 md:p-14 rounded-[40px] shadow-2xl shadow-brand-primary/10 flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="max-w-xl text-center lg:text-left">
                <h3 className="text-2xl md:text-3xl font-serif mb-4 italic">Tailored for you.</h3>
                <ul className="space-y-3 text-brand-bg/80 text-base font-normal leading-relaxed">
                  <li className="flex items-start gap-2 justify-center lg:justify-start">
                    <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-brand-soft" />
                    <span>SMEs wanting to understand their carbon footprint.</span>
                  </li>
                  <li className="flex items-start gap-2 justify-center lg:justify-start">
                    <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-brand-soft" />
                    <span>Businesses responding to customer sustainability requests.</span>
                  </li>
                  <li className="flex items-start gap-2 justify-center lg:justify-start">
                    <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-brand-soft" />
                    <span>Companies starting their ESG journey without high costs.</span>
                  </li>
                </ul>
              </div>
              <div className="text-center lg:text-right border-t lg:border-t-0 lg:border-l border-brand-bg/10 pt-8 lg:pt-0 lg:pl-10 w-full lg:w-auto">
                <p className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-40 mb-2">Investment</p>
                <div className="flex flex-col items-center lg:items-end">
                   <p className="text-4xl md:text-5xl font-serif italic">Contact us</p>
                   <span className="text-[9px] uppercase tracking-widest opacity-30 mt-1">For transparent pricing</span>
                </div>
                <div className="mt-6">
                  <a href="#contact" className="inline-block bg-brand-soft text-brand-primary px-8 py-3 rounded-full text-[9px] font-bold uppercase tracking-widest hover:bg-white transition-colors">
                    Request Details
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section id="why" className="py-24 md:py-32 bg-brand-bg relative overflow-hidden border-t border-brand-border">
          <div className="max-w-7xl mx-auto px-6 md:px-12">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <span className="text-brand-sage font-bold text-[10px] uppercase tracking-[0.3em] mb-4 block">Difference</span>
                <h2 className="text-4xl md:text-6xl font-serif mb-10 leading-tight">Built for <span className="italic">UK SMEs.</span></h2>
                <div className="space-y-4">
                  {[
                    "Clear, transparent and jargon-free",
                    "Affordable one-off starter pricing",
                    "Aligned with UK DESNZ standards",
                    "Direct support from a dedicated expert"
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4 group">
                      <CheckCircle2 className="w-5 h-5 text-brand-sage mt-1 opacity-40" />
                      <span className="text-lg font-medium opacity-80 group-hover:opacity-100 transition-opacity tracking-tight">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-white p-8 md:p-12 rounded-[48px] border border-brand-border shadow-sm">
                 <h3 className="text-brand-sage font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Coming in Late 2026</h3>
                 <div className="grid gap-3">
                    {[
                      "Net Zero Roadmaps",
                      "ESG Reporting Support",
                      "Environmental Audits"
                    ].map((service, idx) => (
                      <div key={idx} className="bg-brand-soft/40 p-5 rounded-[20px] border border-brand-border flex items-center justify-between group hover:bg-brand-soft transition-all">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-60 group-hover:opacity-100">{service}</span>
                        <Zap className="w-4 h-4 text-brand-sage/40 group-hover:text-brand-sage" />
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contact & Booking Section */}
        <section id="contact" className="py-24 md:py-32 bg-white border-t border-brand-border">
          <div className="max-w-5xl mx-auto px-6 md:px-12">
            <div className="text-center mb-20 space-y-6">
              <span className="text-brand-sage font-bold text-[10px] uppercase tracking-[0.3em] block">Connect</span>
              <h2 className="text-5xl md:text-7xl font-serif italic leading-[1.1]">Ready to <span className="not-italic">Start?</span></h2>
              <p className="text-lg text-brand-primary/60 max-w-2xl mx-auto leading-relaxed">
                Book a focused session to discuss your sustainability goals. No pressure—just practical next steps for your UK SME.
              </p>
            </div>

              <div className="space-y-32">
              {/* Admin Dashboard section */}
              {isAdminMode && (
                <div id="admin-dashboard-panel" className="bg-brand-sage/5 rounded-[40px] border border-brand-sage/30 p-8 md:p-12 mb-10 overflow-hidden relative shadow-sm animate-in fade-in duration-500">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                      <div className="flex items-center gap-3">
                         <ShieldCheck className="w-5 h-5 text-brand-sage" />
                         <h3 className="text-2xl font-serif italic text-brand-primary">Admin <span className="not-italic">Dashboard</span></h3>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-brand-sage/10 text-brand-sage px-3 py-1 rounded-full border border-brand-sage/20">Day Off & Booking Manager Active</span>
                   </div>
                   
                   <p className="text-sm text-brand-primary/70 mb-8 leading-relaxed max-w-2xl">
                     You are in Admin Mode. Click any date on the calendar below to toggle professional days off. All booked client consultation slots are listed below—you can cancel or delete any slot with a single click.
                   </p>

                   <div className="space-y-4">
                     <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary/60">Active Client Bookings ({busySlots.length})</h4>
                     {busySlots.length === 0 ? (
                       <p className="text-xs tracking-widest text-brand-primary/40 p-6 bg-white border border-brand-border rounded-2xl italic text-center">No active client bookings found</p>
                     ) : (
                       <div className="grid md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                         {busySlots.map((booking) => (
                           <div key={booking.id} className="bg-white p-5 rounded-2xl border border-brand-border flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                 <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase opacity-30">Date</span>
                                    <span className="text-sm font-bold">{booking.date}</span>
                                 </div>
                                 <div className="w-px h-6 bg-brand-border" />
                                 <div className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase opacity-30">Time</span>
                                    <span className="text-sm font-bold">{booking.time}</span>
                                 </div>
                              </div>
                              <button 
                                 onClick={() => booking.id && handleCancelBooking(booking.id)}
                                 className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-[8px] font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
                              >
                                 Delete
                              </button>
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                </div>
              )}

              {/* Interactive Booking */}
                <div id="booking-calendar" className="scroll-mt-24">
                  <div className="text-center mb-16 space-y-4">
                     <h3 className="text-4xl md:text-5xl font-serif italic mb-2">Book your <span className="not-italic">Session</span></h3>
                     <p className="text-base text-brand-primary/50 max-w-xl mx-auto leading-relaxed">
                       Select a convenient date and time for your consultation. 
                       We recommend booking at least 48 hours in advance.
                     </p>
                  </div>
                  <div className="max-w-7xl mx-auto">
                    <ModernBookingSystem 
                      onSelectSlot={handleSlotSelect} 
                      busySlots={busySlots} 
                      holidays={holidays}
                      onToggleHoliday={handleToggleHoliday}
                      isAdmin={isAdminMode} 
                    />
                  </div>
                </div>

                {/* Message Section */}
                <div className="pt-32 border-t border-brand-border flex flex-col items-center w-full">
                  <div className="text-center mb-16 flex flex-col items-center space-y-4">
                    <h3 className="text-4xl md:text-5xl font-serif italic">Send a <span className="not-italic">Message</span></h3>
                    <p className="text-base text-brand-primary/50 max-w-xl text-center leading-relaxed">
                      Have a specific question or requirement? Drop us a line and we'll get back to you within 24 hours.
                    </p>
                  </div>

                  <form id="inquiry-form" onSubmit={handleSubmit} className="w-full max-w-3xl flex flex-col gap-8 bg-white p-8 md:p-14 rounded-[32px] border border-brand-border shadow-sm">
                    <div className="grid sm:grid-cols-2 gap-8 w-full">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary opacity-70">Company Name</label>
                        <input 
                          required
                          type="text" 
                          placeholder="Company Name" 
                          value={formData.businessName}
                          onChange={(e) => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
                          className="w-full bg-brand-bg/30 border border-brand-border rounded-xl p-5 text-sm focus:ring-1 focus:ring-brand-sage outline-none font-medium placeholder:text-brand-primary/40" 
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary opacity-70">Business Email</label>
                        <input 
                          required
                          type="email" 
                          placeholder="Email Address" 
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full bg-brand-bg/30 border border-brand-border rounded-xl p-5 text-sm focus:ring-1 focus:ring-brand-sage outline-none font-medium placeholder:text-brand-primary/40" 
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-8 w-full">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary opacity-70">Phone Number</label>
                        <input 
                          required
                          type="tel" 
                          placeholder="Phone Number" 
                          value={formData.phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full bg-brand-bg/30 border border-brand-border rounded-xl p-5 text-sm focus:ring-1 focus:ring-brand-sage outline-none font-medium placeholder:text-brand-primary/40" 
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary opacity-70">Inquiry Subject</label>
                        <div className="relative">
                          <select 
                            value={formData.subject}
                            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                            className="w-full bg-brand-bg/30 border border-brand-border rounded-xl p-5 pr-12 text-sm focus:ring-1 focus:ring-brand-sage outline-none appearance-none font-bold text-brand-primary cursor-pointer"
                          >
                            <option>Starter Pack Inquiry</option>
                            <option>Consultation Request</option>
                            <option>General Support</option>
                            <option>Collaboration</option>
                          </select>
                          <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 rotate-90 opacity-40 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 w-full">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-primary opacity-70">How can we help?</label>
                      <textarea 
                        id="message-field"
                        required
                        placeholder="Your message..." 
                        value={formData.message}
                        onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                        className="w-full bg-brand-bg/30 border border-brand-border rounded-xl p-6 text-sm focus:ring-1 focus:ring-brand-sage outline-none resize-none font-medium min-h-[150px] placeholder:text-brand-primary/40"
                      ></textarea>
                    </div>

                    <div className="hidden" aria-hidden="true">
                      <input type="text" name="website_verify" value={formData.website_verify} onChange={(e) => setFormData({ ...formData, website_verify: e.target.value })} />
                    </div>
                    
                      <div className="space-y-6 pt-4 w-full flex flex-col items-center">
                        <button 
                          type="submit"
                          disabled={isSubmitting || submitStatus === "success"}
                          className="w-full bg-brand-primary text-white py-6 rounded-xl text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-brand-sage transition-all shadow-lg flex items-center justify-center gap-3 group disabled:opacity-50"
                        >
                          {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isSubmitting ? "Sending..." : submitStatus === "success" ? "Message Sent" : "Send Message"}
                          {!isSubmitting && submitStatus !== "success" && <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />}
                        </button>
                      </div>
                  </form>


                </div>

                {/* Bottom Contact Info */}
                <div className="mt-24 grid sm:grid-cols-2 gap-12 pt-12 border-t border-brand-border">
                  <div className="flex flex-col items-center text-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-brand-soft/30 flex items-center justify-center text-brand-sage group-hover:bg-brand-sage group-hover:text-white transition-all">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-1">Email</p>
                      <a href="mailto:info@oneearth.eco" className="text-sm font-medium hover:text-brand-sage transition-colors">info@oneearth.eco</a>
                    </div>
                  </div>
                  <div className="flex flex-col items-center text-center gap-3 group">
                    <div className="w-12 h-12 rounded-full bg-brand-soft/30 flex items-center justify-center text-brand-sage group-hover:bg-brand-sage group-hover:text-white transition-all">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-1">Location</p>
                      <p className="text-sm font-medium">Derby, United Kingdom</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

      <footer className="py-12 bg-brand-bg border-t border-brand-border px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">
            <div>Last Updated: April 2026</div>
            <div className="flex items-center gap-2 text-brand-primary opacity-100">
               <Leaf className="w-4 h-4 text-brand-sage" />
               <span className="font-serif italic text-lg opacity-60">One Earth Limited</span>
            </div>
            <div className="flex gap-4 md:gap-8">
              <span>Derby, UK</span>
              <span>v1.2.0-STABLE</span>
            </div>
          </div>
      </footer>

      <style>{`
        @keyframes infinite-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-infinite-scroll {
          animation: infinite-scroll 40s linear infinite;
        }
      `}</style>

      <AnimatePresence>
        {isAdminPromptOpen && (
          <AdminPinPromptModal
            isOpen={isAdminPromptOpen}
            onClose={() => setIsAdminPromptOpen(false)}
            onSubmit={handleAdminPinSubmit}
            pinInput={adminPinInput}
            setPinInput={setAdminPinInput}
            errorMessage={adminPromptError}
          />
        )}
        {adminAlert && (
          <AdminAlertModal
            isOpen={!!adminAlert}
            onClose={() => setAdminAlert(null)}
            title={adminAlert.title}
            message={adminAlert.message}
          />
        )}
        {submitStatus === "success" && (
          <SuccessModal 
            isOpen={submitStatus === "success"}
            onClose={() => {
              setSubmitStatus("idle");
              setBookedSlotDetails(null);
            }}
            bookedSlot={bookedSlotDetails}
          />
        )}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-brand-primary/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[40px] p-10 md:p-14 w-full max-w-lg shadow-2xl text-center space-y-8"
            >
              <div className="w-20 h-20 rounded-full bg-brand-soft text-brand-primary flex items-center justify-center mx-auto">
                <LogOut className="w-10 h-10" />
              </div>
              
              <div className="space-y-4">
                <h3 className="text-3xl font-serif italic text-brand-primary">Confirm <span className="not-italic">Logout</span></h3>
                <p className="text-base text-brand-primary/60 leading-relaxed">
                  Are you sure you want to log out of your account?
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-4 border border-brand-border rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-brand-bg transition-all"
                >
                  Stay Logged In
                </button>
                <button 
                  onClick={confirmLogout}
                  className="flex-1 py-4 bg-brand-primary text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-brand-sage transition-all shadow-lg"
                >
                  Yes, Logout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
