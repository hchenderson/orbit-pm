"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Task, WorkspaceData } from "@/lib/types";

const statusTone: Record<Task["status"], string> = { "Not Started": "slate", "In Progress": "blue", Blocked: "red", "In Review": "amber", Complete: "green" };

function firstOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12);
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ProjectCalendar({ data, tasks, onTask }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void }) {
  const [displayMonth, setDisplayMonth] = useState(() => firstOfMonth(new Date()));
  const today = new Date();
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const agendaTasks = tasks.filter((task) => task.dueDate.startsWith(monthPrefix)).sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title));
  const cells = Array.from({ length: 42 }, (_, index) => {
    const relativeDay = index - firstDay + 1;
    if (relativeDay < 1) return { day: previousMonthDays + relativeDay, month: month - 1, muted: true };
    if (relativeDay > daysInMonth) return { day: relativeDay - daysInMonth, month: month + 1, muted: true };
    return { day: relativeDay, month, muted: false };
  });

  function moveMonth(offset: number) {
    setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1, 12));
  }

  return <div className="calendar-panel panel"><header><div className="calendar-navigation"><button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button><h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(displayMonth)}</h2><button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button></div><button className="secondary-button" onClick={() => setDisplayMonth(firstOfMonth(new Date()))}>Today</button></header><div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <strong className="calendar-weekday" key={day}>{day}</strong>)}{cells.map((cell, index) => { const cellDate = new Date(year, cell.month, cell.day, 12); const date = dateKey(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()); const dayTasks = tasks.filter((task) => task.dueDate === date); const isToday = date === dateKey(today.getFullYear(), today.getMonth(), today.getDate()); return <div className={`calendar-day ${cell.muted ? "muted" : ""} ${isToday ? "today" : ""}`} key={`${date}-${index}`}><span>{cell.day}</span>{dayTasks.slice(0, 3).map((task) => <button key={task.id} className={statusTone[task.status]} onClick={() => onTask(task.id)}><i style={{ background: data.members.find((member) => member.id === task.assigneeId)?.color }} />{task.title}</button>)}{dayTasks.length > 3 && <small>+{dayTasks.length - 3} more</small>}</div>; })}</div><section className="calendar-agenda" aria-label={`${new Intl.DateTimeFormat("en", { month: "long" }).format(displayMonth)} agenda`}><header><strong>Agenda</strong><span>{agendaTasks.length} task{agendaTasks.length === 1 ? "" : "s"}</span></header>{agendaTasks.length ? <div>{agendaTasks.map((task) => { const member = data.members.find((item) => item.id === task.assigneeId); return <button key={task.id} onClick={() => onTask(task.id)}><time dateTime={task.dueDate}>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${task.dueDate}T12:00:00`))}</time><span><strong>{task.title}</strong><small>{member?.name ?? "Unassigned"} · {task.status}</small></span><i className={statusTone[task.status]} /></button>; })}</div> : <p>No tasks are due this month.</p>}</section></div>;
}
