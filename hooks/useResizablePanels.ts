import { useState, useEffect, useCallback } from 'react';

export type ActiveResizer = 'MAIN' | 'DASH_V' | 'DASH_H' | null;

// Encapsulates the draggable-panel layout: the three split percentages, the
// minimized flags, their localStorage persistence, and the window-level
// mousemove/mouseup drag handling. Extracted verbatim from App.tsx.
export function useResizablePanels() {
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    try { const saved = localStorage.getItem('eqnoc_leftPanelWidth'); return saved ? parseFloat(saved) : 55; } catch { return 55; }
  });
  const [dashboardSplitV, setDashboardSplitV] = useState(() => {
    try { const saved = localStorage.getItem('eqnoc_dashboardSplitV'); return saved ? parseFloat(saved) : 30; } catch { return 30; }
  });
  const [dashboardSplitH, setDashboardSplitH] = useState(() => {
    try { const saved = localStorage.getItem('eqnoc_dashboardSplitH'); return saved ? parseFloat(saved) : 60; } catch { return 60; }
  });
  const [activeResizer, setActiveResizer] = useState<ActiveResizer>(null);
  const [isDiagnosticMinimized, setIsDiagnosticMinimized] = useState(() => {
    try { return localStorage.getItem('eqnoc_isDiagnosticMinimized') === 'true'; } catch { return false; }
  });
  const [isCommandPanelMinimized, setIsCommandPanelMinimized] = useState(() => {
    try { return localStorage.getItem('eqnoc_isCommandPanelMinimized') === 'true'; } catch { return false; }
  });

  // Persist layout state
  useEffect(() => {
    try {
      localStorage.setItem('eqnoc_leftPanelWidth', leftPanelWidth.toString());
      localStorage.setItem('eqnoc_dashboardSplitV', dashboardSplitV.toString());
      localStorage.setItem('eqnoc_dashboardSplitH', dashboardSplitH.toString());
      localStorage.setItem('eqnoc_isDiagnosticMinimized', isDiagnosticMinimized.toString());
      localStorage.setItem('eqnoc_isCommandPanelMinimized', isCommandPanelMinimized.toString());
    } catch (e) {
      console.error('Failed to save layout state', e);
    }
  }, [leftPanelWidth, dashboardSplitV, dashboardSplitH, isDiagnosticMinimized, isCommandPanelMinimized]);

  const resize = useCallback((e: MouseEvent) => {
    if (!activeResizer) return;
    if (e.preventDefault) e.preventDefault();

    if (activeResizer === 'MAIN') {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 25 && newWidth < 75) {
        setLeftPanelWidth(newWidth);
      }
    } else if (activeResizer === 'DASH_V') {
      if (isDiagnosticMinimized) return; // Disable resize when minimized
      const offsetTop = 117; // Header ~64px + Tabs ~53px
      const containerHeight = window.innerHeight - offsetTop;
      const relativeY = e.clientY - offsetTop;
      const newH = (relativeY / containerHeight) * 100;
      if (newH > 10 && newH < 90) setDashboardSplitV(newH);
    } else if (activeResizer === 'DASH_H') {
      if (isCommandPanelMinimized) return; // Disable resize when minimized
      const panelPx = (leftPanelWidth / 100) * window.innerWidth;
      const availableW = panelPx - 48; // p-6 is 24px each side
      const relativeX = e.clientX - 24;
      const newW = (relativeX / availableW) * 100;
      if (newW > 15 && newW < 85) setDashboardSplitH(newW);
    }
  }, [activeResizer, leftPanelWidth, isDiagnosticMinimized, isCommandPanelMinimized]);

  const stopResizing = useCallback(() => {
    setActiveResizer(null);
    document.body.style.cursor = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return {
    leftPanelWidth,
    dashboardSplitV,
    dashboardSplitH,
    activeResizer, setActiveResizer,
    isDiagnosticMinimized, setIsDiagnosticMinimized,
    isCommandPanelMinimized, setIsCommandPanelMinimized,
  };
}
