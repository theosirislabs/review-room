import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Clock3, ListFilter, Plus, Sparkles } from "lucide-react";
import type { Post } from "../types";
import { buildCalendarEvents, type CalendarEvent, type CalendarEventKind, scheduleHealth } from "../agencyCalendar";
import { isOverdue } from "../utils";

const STATUS_DOT: Record<string, string> = {
  Concept: "bg-zinc-400",
  Draft: "bg-blue-500",
  "Internal QA": "bg-amber-500",
  "Ready for Client": "bg-indigo-500",
  "Changes Requested": "bg-red-500",
  Approved: "bg-emerald-500",
  "Ready to Schedule": "bg-violet-500",
  Scheduled: "bg-purple-600",
  Posted: "bg-zinc-900",
};

const FORMAT_LABEL: Record<string, string> = {
  image: "Image",
  carousel: "Carousel",
  reel: "Reel",
  story: "Story",
};

const EVENT_LABEL: Record<CalendarEventKind, string> = {
  planned: "Planned",
  scheduled: "Scheduled",
  "feedback-due": "Feedback due",
};

type EventFilter = "all" | CalendarEventKind | "attention";

interface Props {
  posts: Post[];
  onOpenPost: (post: Post) => void;
  onCreatePostForDate?: (date: string) => void;
  onSchedulePost?: (post: Post, date: string) => void;
  canCreate?: boolean;
  canSchedule?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(dateFromKey(value));
}

function isFinal(post: Post) {
  return post.internalStatus === "Approved" || post.internalStatus === "Posted";
}

function eventSummary(event: CalendarEvent) {
  return event.kinds.map((kind) => EVENT_LABEL[kind]).join(" · ");
}

function eventMatchesFilter(event: CalendarEvent, filter: EventFilter) {
  if (filter === "all") return true;
  if (filter === "attention") {
    return event.post.isBlocked || (!isFinal(event.post) && isOverdue(event.post.dueDate));
  }
  return event.kinds.includes(filter);
}

function CalendarMetric({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick?: () => void }) {
  const content = <><span className={`text-2xl font-black ${tone}`}>{value}</span><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span></>;
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left bg-white border border-zinc-100 hover:border-zinc-300 hover:shadow-sm rounded-2xl px-4 py-3 transition-all flex flex-col gap-0.5">
      {content}
    </button>
  ) : <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-3 flex flex-col gap-0.5">{content}</div>;
}

function EventPill({ event, compact = false, onOpen }: { event: CalendarEvent; compact?: boolean; onOpen: () => void }) {
  const attention = event.post.isBlocked || (!isFinal(event.post) && isOverdue(event.post.dueDate));
  const kindClass = attention
    ? "border-red-200 bg-red-50 text-red-700"
    : event.kinds.includes("scheduled")
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : event.kinds.includes("feedback-due")
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left border rounded-lg transition-colors hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${kindClass} ${compact ? "px-1.5 py-1" : "px-3 py-2.5"}`}
      aria-label={`Open ${event.post.title}. ${eventSummary(event)}.`}
    >
      <span className="flex items-start gap-1.5 min-w-0">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[event.post.internalStatus] || "bg-zinc-400"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block font-bold truncate ${compact ? "text-[10px] leading-tight" : "text-xs"}`}>{event.post.title}</span>
          {!compact && (
            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-semibold opacity-80">
              <span>{eventSummary(event)}</span>
              <span>{event.post.time || "No time"}</span>
              {event.post.campaignCode && <span>{event.post.campaignCode}</span>}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function CalendarView({ posts, onOpenPost, onCreatePostForDate, onSchedulePost, canCreate = false, canSchedule = false }: Props) {
  const today = new Date();
  const todayKey = dateKey(today);
  const [viewDate, setViewDate] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const { year, month } = viewDate;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  const campaigns = useMemo(() => [...new Set(posts.map((post) => post.campaignCode).filter(Boolean))].sort(), [posts]);
  const assignees = useMemo(() => [...new Set(posts.map((post) => post.assignee).filter((assignee) => assignee && assignee !== "Unassigned"))].sort(), [posts]);
  const health = useMemo(() => scheduleHealth(posts, today), [posts, todayKey]);

  const events = useMemo(() => buildCalendarEvents(posts), [posts]);
  const visibleEvents = useMemo(() => events.filter((event) => (
    eventMatchesFilter(event, eventFilter)
    && (!campaignFilter || event.post.campaignCode === campaignFilter)
    && (!assigneeFilter || event.post.assignee === assigneeFilter)
  )), [events, eventFilter, campaignFilter, assigneeFilter]);
  const eventsByDate = useMemo(() => {
    const next = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const bucket = next.get(event.date) || [];
      bucket.push(event);
      next.set(event.date, bucket);
    }
    return next;
  }, [visibleEvents]);

  const monthEvents = useMemo(() => visibleEvents.filter((event) => event.date.startsWith(monthPrefix)), [visibleEvents, monthPrefix]);
  const scheduledThisMonth = useMemo(() => new Set(monthEvents.filter((event) => event.kinds.includes("scheduled")).map((event) => event.postId)).size, [monthEvents]);
  const dueThisMonth = useMemo(() => new Set(monthEvents.filter((event) => event.kinds.includes("feedback-due")).map((event) => event.postId)).size, [monthEvents]);
  const selectedEvents = eventsByDate.get(selectedDate) || [];
  const readyQueue = health.readyToSchedule.filter((post) => !campaignFilter || post.campaignCode === campaignFilter).slice(0, 5);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const setMonthForDate = (value: string) => {
    if (!value) return;
    const next = dateFromKey(value);
    setSelectedDate(value);
    setViewDate({ year: next.getFullYear(), month: next.getMonth() });
  };

  const moveMonth = (direction: -1 | 1) => {
    const next = new Date(year, month + direction, 1);
    const selectedDay = dateFromKey(selectedDate).getDate();
    const destinationDay = Math.min(selectedDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate());
    const nextSelectedDate = dateKey(new Date(next.getFullYear(), next.getMonth(), destinationDay));
    setViewDate({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedDate(nextSelectedDate);
  };

  const resetFilters = () => {
    setEventFilter("all");
    setCampaignFilter("");
    setAssigneeFilter("");
  };

  const activeFilters = eventFilter !== "all" || !!campaignFilter || !!assigneeFilter;

  return (
    <section className="space-y-5" aria-labelledby="calendar-title" data-testid="agency-calendar">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em]">Content operations</span>
          </div>
          <h2 id="calendar-title" className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">Calendar</h2>
          <p className="text-sm text-zinc-500 mt-1">Plan publication, review deadlines, and the work waiting to be scheduled.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && onCreatePostForDate && (
            <button type="button" onClick={() => onCreatePostForDate(selectedDate)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              <Plus className="w-4 h-4" /> New post for {formatDate(selectedDate, { month: "short", day: "numeric" })}
            </button>
          )}
          <label className="sr-only" htmlFor="calendar-jump-date">Jump to date</label>
          <input id="calendar-jump-date" type="date" value={selectedDate} onChange={(event) => setMonthForDate(event.target.value)} className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none transition-shadow focus:ring-2 focus:ring-indigo-500/30" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CalendarMetric label="Scheduled this month" value={scheduledThisMonth} tone="text-violet-700" onClick={() => setEventFilter("scheduled")} />
        <CalendarMetric label="Feedback due" value={dueThisMonth} tone="text-amber-700" onClick={() => setEventFilter("feedback-due")} />
        <CalendarMetric label="Ready to schedule" value={health.readyToSchedule.length} tone="text-indigo-700" onClick={() => setEventFilter("all")} />
        <CalendarMetric label="Needs attention" value={health.blocked.length + health.overdueFeedback.length + health.missingScheduleTime.length} tone="text-red-600" onClick={() => setEventFilter("attention")} />
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => moveMonth(-1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label={`Show ${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))}`}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => setMonthForDate(todayKey)} className="min-h-10 rounded-xl px-3 text-sm font-black text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                {monthLabel}
              </button>
              <button type="button" onClick={() => moveMonth(1)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label={`Show ${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month + 1, 1))}`}>
                <ChevronRight className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => setMonthForDate(todayKey)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">Today</button>
            </div>

            <div className="flex flex-wrap items-center gap-2" aria-label="Calendar filters">
              <ListFilter className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <select aria-label="Filter calendar events" value={eventFilter} onChange={(event) => setEventFilter(event.target.value as EventFilter)} className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-indigo-500/30">
                <option value="all">All events</option>
                <option value="scheduled">Scheduled</option>
                <option value="planned">Planned</option>
                <option value="feedback-due">Feedback due</option>
                <option value="attention">Needs attention</option>
              </select>
              {campaigns.length > 0 && <select aria-label="Filter calendar by campaign" value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)} className="min-h-10 max-w-[170px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-indigo-500/30"><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select>}
              {assignees.length > 0 && <select aria-label="Filter calendar by assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="min-h-10 max-w-[170px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none focus:ring-2 focus:ring-indigo-500/30"><option value="">All assignees</option>{assignees.map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}</select>}
              {activeFilters && <button type="button" onClick={resetFilters} className="min-h-10 rounded-xl px-3 text-xs font-bold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">Clear</button>}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px]" role="grid" aria-label={`${monthLabel} content calendar`}>
            <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/70" role="row">
              {WEEKDAYS.map((weekday) => <div key={weekday} role="columnheader" className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{weekday}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} role="gridcell" className="min-h-32 border-b border-r border-zinc-100 bg-zinc-50/40" aria-hidden="true" />;
                const currentDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate.get(currentDate) || [];
                const isSelected = currentDate === selectedDate;
                const isToday = currentDate === todayKey;
                const shown = dayEvents.slice(0, 3);
                return (
                  <div key={currentDate} role="gridcell" aria-selected={isSelected} className={`min-h-32 border-b border-r border-zinc-100 p-1.5 transition-colors ${isSelected ? "bg-indigo-50/70" : "bg-white hover:bg-zinc-50"}`}>
                    <button type="button" onClick={() => setSelectedDate(currentDate)} className={`mb-1 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${isToday ? "bg-indigo-600 text-white" : isSelected ? "bg-indigo-100 text-indigo-800" : "text-zinc-600 hover:bg-zinc-100"}`} aria-label={`Show agenda for ${formatDate(currentDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}>
                      {day}
                    </button>
                    <div className="space-y-1">
                      {shown.map((event) => <EventPill key={`${event.postId}:${event.date}`} event={event} compact onOpen={() => onOpenPost(event.post)} />)}
                      {dayEvents.length > shown.length && <button type="button" onClick={() => setSelectedDate(currentDate)} className="w-full rounded-md px-1.5 py-1 text-left text-[10px] font-bold text-indigo-700 hover:bg-indigo-100">+{dayEvents.length - shown.length} more</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm" aria-live="polite" aria-labelledby="agenda-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Daily agenda</p>
              <h3 id="agenda-title" className="mt-1 text-lg font-black text-zinc-900">{formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h3>
              <p className="mt-1 text-xs font-medium text-zinc-500">{selectedEvents.length ? `${selectedEvents.length} item${selectedEvents.length === 1 ? "" : "s"} in the current view.` : "No items match the current filters."}</p>
            </div>
            {canCreate && onCreatePostForDate && <button type="button" onClick={() => onCreatePostForDate(selectedDate)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"><Plus className="w-4 h-4" /> Add post</button>}
          </div>

          <div className="mt-5 space-y-2">
            {selectedEvents.length > 0 ? selectedEvents.map((event) => <EventPill key={`${event.postId}:${event.date}`} event={event} onOpen={() => onOpenPost(event.post)} />) : (
              <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
                <CalendarDays className="mx-auto h-6 w-6 text-zinc-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-zinc-500">Nothing planned here</p>
                <p className="mt-1 text-xs text-zinc-400">Choose another date, clear filters, or create a post for this day.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4" aria-label="Schedule health">
          {(health.missingScheduleTime.length > 0 || health.overdueFeedback.length > 0 || health.blocked.length > 0) && (
            <section className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-black text-red-800">Needs operator attention</h3>
                  <ul className="mt-2 space-y-1 text-xs font-medium text-red-700">
                    {health.missingScheduleTime.length > 0 && <li>{health.missingScheduleTime.length} scheduled post{health.missingScheduleTime.length === 1 ? "" : "s"} missing a publish timestamp.</li>}
                    {health.overdueFeedback.length > 0 && <li>{health.overdueFeedback.length} feedback deadline{health.overdueFeedback.length === 1 ? "" : "s"} overdue.</li>}
                    {health.blocked.length > 0 && <li>{health.blocked.length} blocked post{health.blocked.length === 1 ? "" : "s"} requiring resolution.</li>}
                  </ul>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-indigo-900">Ready-to-schedule queue</h3>
                <p className="mt-1 text-xs text-indigo-700">Move approved creative into the selected day without leaving the calendar.</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {readyQueue.length > 0 ? readyQueue.map((post) => (
                <div key={post.id} className="rounded-xl border border-indigo-100 bg-white/90 p-3">
                  <p className="truncate text-xs font-black text-zinc-900">{post.title}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{post.time || "12:00 PM"} · {FORMAT_LABEL[post.format] || post.format}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => onOpenPost(post)} className="min-h-8 rounded-lg px-2 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">Review</button>
                    {canSchedule && onSchedulePost && <button type="button" onClick={() => onSchedulePost(post, selectedDate)} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-[10px] font-bold text-white hover:bg-indigo-700"><Clock3 className="h-3 w-3" /> Schedule</button>}
                  </div>
                </div>
              )) : <p className="rounded-xl border border-dashed border-indigo-200 px-3 py-4 text-center text-xs font-medium text-indigo-700">No approved posts are waiting for a schedule.</p>}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
