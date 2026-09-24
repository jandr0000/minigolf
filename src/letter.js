// Draws a PDF's pages onto canvases with PDF.js, so the letter shows the same on every device. Many browsers
// (Chrome on Android, some iPhones, desktops set to download PDFs) show nothing for a PDF in an <iframe>.
// PDF.js is loaded on first use; the legacy build also runs on older phone browsers.
export function renderPdf(container, url) {
  let cancelled = false;
  container.replaceChildren(note('Opening the letter…'));

  (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ url });
    const pdf = await task.promise;
    if (cancelled) return task.destroy();
    // sharp at the width the pages are shown, but capped so a long letter doesn't eat a phone's memory
    const cssWidth = container.clientWidth || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth * dpr) / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (cancelled) return task.destroy();
      // show the first page as soon as it is ready
      if (n === 1) container.replaceChildren(canvas);
      else container.append(canvas);
    }
    task.destroy();
  })().catch((err) => {
    console.warn('letter:', err);
    if (!cancelled) container.replaceChildren(note('The letter could not be shown here. Use “open the PDF” below.'));
  });

  return () => {
    cancelled = true;
    container.replaceChildren();
  };
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'letter-note';
  p.textContent = text;
  return p;
}
