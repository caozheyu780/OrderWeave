'use client';
import { useEffect } from 'react';
export default function Home() {
  useEffect(() => {
    if (document.querySelector('script[data-takeaway-app]')) return;
    const script = document.createElement('script');
    script.type = 'module'; script.src = '/app.js'; script.dataset.takeawayApp = 'true';
    document.body.appendChild(script);
  }, []);
  return <><div id="app"/><div id="toast" role="status" aria-live="polite"/><dialog id="modal" aria-labelledby="modal-title"/><dialog id="confirmation" aria-labelledby="confirm-title"/></>;
}
