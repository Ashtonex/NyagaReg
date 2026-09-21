import jsPDF from 'jspdf';
import type { Attendee, AppSettings } from '../../types';
import { downloadBlob } from '../../db/syncEngine';

/**
 * Retrieves the QR canvas element from the DOM for an attendee.
 */
export function getAttendeeQrCanvas(registrationId: string): HTMLCanvasElement | null {
  return (
    (document.getElementById(`receipt-qr-${registrationId}`) as HTMLCanvasElement) ||
    (document.getElementById(`batch-qr-${registrationId}`) as HTMLCanvasElement) ||
    (document.getElementById(`qr-canvas-${registrationId}`) as HTMLCanvasElement) ||
    (document.querySelector(`canvas[data-qr="${registrationId}"]`) as HTMLCanvasElement) ||
    (document.querySelector('canvas') as HTMLCanvasElement) ||
    null
  );
}

/**
 * Converts a QR canvas to a PNG Data URL safely.
 */
export function getQrDataUrl(qrCanvasOrDataUrl?: HTMLCanvasElement | string | null, registrationId?: string): string | null {
  if (typeof qrCanvasOrDataUrl === 'string' && qrCanvasOrDataUrl.startsWith('data:image/')) {
    return qrCanvasOrDataUrl;
  }
  if (qrCanvasOrDataUrl instanceof HTMLCanvasElement) {
    try {
      return qrCanvasOrDataUrl.toDataURL('image/png');
    } catch (e) {
      console.warn('Could not extract data URL from canvas:', e);
    }
  }
  if (registrationId) {
    const el = getAttendeeQrCanvas(registrationId);
    if (el) {
      try {
        return el.toDataURL('image/png');
      } catch (e) {
        console.warn('Could not extract data URL from found canvas:', e);
      }
    }
  }
  return null;
}

/**
 * Generates an official, print-ready Attendee E-Receipt & Gate Pass PDF.
 * Formatted as an executive A5 portrait admission pass (148 x 210 mm).
 */
export function generateAttendeeReceiptPDF(
  attendee: Attendee,
  settings: AppSettings,
  qrSource?: HTMLCanvasElement | string | null
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const qrDataUrl = getQrDataUrl(qrSource, attendee.registrationId);
  const dateStr = attendee.registrationDate
    ? attendee.registrationDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // Background base
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 148, 210, 'F');

  // 1. Header Banner (Deep Slate 900)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 148, 30, 'F');

  // Top accent line (Teal 600)
  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 0, 148, 2.5, 'F');

  // Camp Name
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(settings.campName.toUpperCase(), 10, 13);

  // Subtitle
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('OFFICIAL ATTENDEE E-RECEIPT & ADMISSION PASS', 10, 19);

  // Verification status badge on top right
  doc.setFillColor(6, 95, 70); // emerald-800
  doc.roundedRect(98, 8, 40, 7, 2, 2, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text('REGISTRATION CONFIRMED', 118, 13, { align: 'center' });

  // Date line
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Issued: ${dateStr}`, 118, 21, { align: 'center' });

  // 2. Attendee Identity Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(10, 34, 128, 42, 2, 2, 'FD');

  // Attendee Full Name
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('ATTENDEE FULL NAME', 15, 41);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(attendee.fullName.toUpperCase(), 15, 48);

  // Registration ID Pill (Top Right of Identity card)
  doc.setFillColor(240, 253, 250); // teal-50
  doc.setDrawColor(13, 148, 136); // teal-600
  doc.roundedRect(88, 38, 44, 14, 2, 2, 'FD');

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 118, 110); // teal-700
  doc.text('REGISTRATION ID', 110, 43, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('courier', 'bold');
  doc.setTextColor(17, 94, 89);
  doc.text(attendee.registrationId, 110, 49.5, { align: 'center' });

  // Demographics
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Church / Assembly:', 15, 57);
  doc.setFont('helvetica', 'normal');
  doc.text(attendee.churchAssembly || 'General Assembly', 48, 57);

  doc.setFont('helvetica', 'bold');
  doc.text('Phone / WhatsApp:', 15, 63);
  doc.setFont('helvetica', 'normal');
  doc.text(attendee.phoneNumber || 'N/A', 48, 63);

  doc.setFont('helvetica', 'bold');
  doc.text('Emergency Contact:', 15, 69);
  doc.setFont('helvetica', 'normal');
  const emg = attendee.emergencyContactName
    ? `${attendee.emergencyContactName} (${attendee.emergencyContactPhone || 'N/A'})`
    : 'None listed';
  doc.text(emg, 48, 69);

  // 3. Financial Summary 3-Box Grid
  const cardY = 80;
  const cardW = 40;
  const cardH = 18;

  // Box 1: Amount Due
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('CAMP FEE DUE', 14, cardY + 5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`US$${attendee.amountDue.toFixed(2)}`, 14, cardY + 12);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Standard Camp Fee', 14, cardY + 16);

  // Box 2: Amount Paid (Emerald Highlight)
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.roundedRect(54, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87); // emerald-700
  doc.text('AMOUNT PAID', 58, cardY + 5);
  doc.setFontSize(11);
  doc.setTextColor(4, 120, 87);
  doc.text(`US$${attendee.amountPaid.toFixed(2)}`, 58, cardY + 12);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(attendee.paymentStatus, 58, cardY + 16);

  // Box 3: Balance (Amber if due, emerald if 0)
  const hasBal = attendee.balance > 0;
  if (hasBal) {
    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(245, 158, 11);
    doc.setTextColor(180, 83, 9);
  } else {
    doc.setFillColor(240, 253, 244); // green-50
    doc.setDrawColor(74, 222, 128);
    doc.setTextColor(22, 101, 52);
  }
  doc.roundedRect(98, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('OUTSTANDING BALANCE', 102, cardY + 5);
  doc.setFontSize(11);
  doc.text(`US$${attendee.balance.toFixed(2)}`, 102, cardY + 12);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(hasBal ? 'Payable upon arrival' : 'Fully Cleared', 102, cardY + 16);

  // Registrar Metadata Info
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Recorded by: ${attendee.registeredBy || 'Camp Registrar'} • Status: ${attendee.paymentStatus} • Check-in: ${attendee.checkInStatus}`,
    10,
    cardY + 23
  );

  // 4. Centered QR Code Box
  const qrBoxY = 107;
  const qrBoxW = 128;
  const qrBoxH = 68;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(10, qrBoxY, qrBoxW, qrBoxH, 2, 2, 'FD');

  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, 'PNG', 52, qrBoxY + 4, 44, 44);
    } catch (e) {
      console.warn('Could not render QR code into PDF:', e);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`[QR CODE: ${attendee.registrationId}]`, 74, qrBoxY + 26, { align: 'center' });
    }
  } else {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(52, qrBoxY + 4, 44, 44, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(attendee.registrationId, 74, qrBoxY + 26, { align: 'center' });
  }

  // Gate Instructions below QR Code
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('PRESENT THIS QR CODE AT CAMP GATE DESK', 74, qrBoxY + 54, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('courier', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Token: ${attendee.verificationToken || attendee.registrationId}`, 74, qrBoxY + 60, { align: 'center' });

  // 5. Official Notes & Venue Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(10, 180, 138, 180);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`Camp Venue: ${settings.venue}`, 10, 185);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('• Transport and optional camp activities are separate from the standard camp registration fee.', 10, 190);
  doc.text('• Keep this receipt accessible on your mobile device or present as a printed voucher at check-in.', 10, 194);
  doc.text('• For registration inquiries or transfers, contact the camp registration desk with your ID.', 10, 198);

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Provincial Camp 2026 Registration System • Offline-Verified Pass • Verification ID: ${attendee.id.slice(0, 13)}`,
    10,
    204
  );

  return doc;
}

/**
 * Downloads the attendee receipt PDF directly to device storage.
 */
export function downloadAttendeeReceiptPDF(
  attendee: Attendee,
  settings: AppSettings,
  qrSource?: HTMLCanvasElement | string | null
): void {
  const doc = generateAttendeeReceiptPDF(attendee, settings, qrSource);
  const cleanName = attendee.fullName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Receipt_${attendee.registrationId}_${cleanName}.pdf`;
  doc.save(filename);
}

/**
 * Generates a high-resolution pass image (.png) as a Blob using Canvas 2D.
 * Pixel dimensions: 750px wide x 1100px high (retina-ready digital pass badge).
 */
export async function generatePassImageBlob(
  attendee: Attendee,
  settings: AppSettings,
  qrSource?: HTMLCanvasElement | string | null
): Promise<Blob> {
  const width = 750;
  const height = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize 2D canvas context');

  // Background
  ctx.fillStyle = '#F8FAFC'; // slate-50
  ctx.fillRect(0, 0, width, height);

  // Main Card Container (white with subtle rounded border)
  const cardX = 30;
  const cardY = 30;
  const cardW = width - 60;
  const cardH = height - 60;
  const cardRadius = 24;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();
  ctx.clip();

  // Header Banner (Navy slate-900)
  const headerHeight = 170;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(cardX, cardY, cardW, headerHeight);

  // Top Accent Bar (Teal)
  ctx.fillStyle = '#0D9488';
  ctx.fillRect(cardX, cardY, cardW, 8);

  // Camp Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(settings.campName.toUpperCase(), width / 2, cardY + 58);

  // Subtitle
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
  ctx.fillText('OFFICIAL ATTENDEE E-RECEIPT & GATE PASS', width / 2, cardY + 86);

  // Confirmed Pill in Header
  const pillW = 260;
  const pillH = 34;
  const pillX = width / 2 - pillW / 2;
  const pillY = cardY + 110;
  ctx.fillStyle = '#065F46'; // emerald-800
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 17);
  ctx.fill();

  ctx.fillStyle = '#34D399'; // emerald-400
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('✓ REGISTRATION CONFIRMED', width / 2, pillY + 22);

  // Perforation / Ticket Cut Line
  const cutY = cardY + headerHeight + 35;
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 24, cutY);
  ctx.lineTo(cardX + cardW - 24, cutY);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Ticket Cutout Notches on Left & Right
  ctx.restore(); // unclip
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.arc(cardX, cutY, 16, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cardX + cardW, cutY, 16, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.fill();

  // Re-save context for attendee details
  ctx.save();

  // Attendee Identity
  const infoTop = cutY + 45;
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTENDEE NAME', width / 2, infoTop);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(attendee.fullName.toUpperCase(), width / 2, infoTop + 36);

  // Registration ID Badge (Center Pill)
  const regPillW = 200;
  const regPillH = 44;
  const regPillX = width / 2 - regPillW / 2;
  const regPillY = infoTop + 54;

  ctx.fillStyle = '#F0FDFA'; // teal-50
  ctx.strokeStyle = '#0D9488'; // teal-600
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(regPillX, regPillY, regPillW, regPillH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F766E'; // teal-700
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(attendee.registrationId, width / 2, regPillY + 30);

  // Church and Phone
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(attendee.churchAssembly || 'General Assembly', width / 2, regPillY + 75);

  ctx.fillStyle = '#64748B';
  ctx.font = '16px monospace';
  ctx.fillText(attendee.phoneNumber || '', width / 2, regPillY + 102);

  // Financial Summary Card
  const finY = regPillY + 124;
  const finW = cardW - 60;
  const finX = width / 2 - finW / 2;
  const finH = 92;

  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(finX, finY, finW, finH, 16);
  ctx.fill();
  ctx.stroke();

  // Column 1: Paid
  ctx.textAlign = 'center';
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`US$${attendee.amountPaid.toFixed(2)}`, finX + finW * 0.25, finY + 44);
  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('AMOUNT PAID', finX + finW * 0.25, finY + 68);

  // Divider between columns
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(finX + finW * 0.5, finY + 16);
  ctx.lineTo(finX + finW * 0.5, finY + finH - 16);
  ctx.stroke();

  // Column 2: Status / Balance
  if (attendee.balance > 0) {
    ctx.fillStyle = '#B45309'; // amber-700
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`US$${attendee.balance.toFixed(2)}`, finX + finW * 0.75, finY + 44);
    ctx.fillStyle = '#92400E';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('BALANCE DUE', finX + finW * 0.75, finY + 68);
  } else {
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('FULLY PAID', finX + finW * 0.75, finY + 44);
    ctx.fillStyle = '#065F46';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('CLEARED AT DESK', finX + finW * 0.75, finY + 68);
  }

  // QR Code Box
  const qrBoxY = finY + finH + 24;
  const qrSize = 200;
  const qrBoxX = width / 2 - qrSize / 2;

  // Draw QR Image from Source
  const qrDataUrl = getQrDataUrl(qrSource, attendee.registrationId);
  if (qrDataUrl) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        // White border around QR
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(qrBoxX - 10, qrBoxY - 10, qrSize + 20, qrSize + 20, 16);
        ctx.fill();
        ctx.stroke();

        ctx.drawImage(img, qrBoxX, qrBoxY, qrSize, qrSize);
        resolve();
      };
      img.onerror = () => {
        console.warn('QR image load error');
        resolve();
      };
      img.src = qrDataUrl;
    });
  } else {
    // Fallback QR placeholder
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.roundRect(qrBoxX - 10, qrBoxY - 10, qrSize + 20, qrSize + 20, 16);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(attendee.registrationId, width / 2, qrBoxY + qrSize / 2);
  }

  // Gate check-in instruction text
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Present this QR code at camp check-in.', width / 2, qrBoxY + qrSize + 32);

  // Footer Details
  const footerY = height - 105;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 30, footerY);
  ctx.lineTo(cardX + cardW - 30, footerY);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Venue: ${settings.venue}`, width / 2, footerY + 26);

  ctx.fillStyle = '#64748B';
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Transport and optional activities are separate from standard camp fee.', width / 2, footerY + 48);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '11px monospace';
  ctx.fillText(`Camp Reg System • Pass #${attendee.registrationId} • ${new Date().toISOString().slice(0, 10)}`, width / 2, footerY + 68);

  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob from canvas'));
    }, 'image/png');
  });
}

/**
 * Downloads the pass card as a PNG image file.
 */
export async function downloadPassImage(
  attendee: Attendee,
  settings: AppSettings,
  qrSource?: HTMLCanvasElement | string | null
): Promise<void> {
  const blob = await generatePassImageBlob(attendee, settings, qrSource);
  const cleanName = attendee.fullName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Pass_${attendee.registrationId}_${cleanName}.png`;
  downloadBlob(blob, filename);
}

/**
 * Shares or saves the pass image file using Web Share API on mobile,
 * falling back to downloading the PNG if Web Share is not supported.
 */
export async function sharePassImage(
  attendee: Attendee,
  settings: AppSettings,
  qrSource?: HTMLCanvasElement | string | null
): Promise<{ shared: boolean; downloaded: boolean }> {
  const blob = await generatePassImageBlob(attendee, settings, qrSource);
  const cleanName = attendee.fullName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Pass_${attendee.registrationId}_${cleanName}.png`;

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${attendee.fullName} - Camp Pass`,
          text: `Official admission pass for ${attendee.fullName} (${attendee.registrationId}) - Provincial Camp 2026`
        });
        return { shared: true, downloaded: false };
      } catch (err: any) {
        // If user cancelled the share dialogue, don't download unnecessarily
        if (err.name === 'AbortError') {
          return { shared: false, downloaded: false };
        }
      }
    }
  }

  // Fallback: direct download
  downloadBlob(blob, filename);
  return { shared: false, downloaded: true };
}

/**
 * Generates an A4 PDF containing multiple attendee passes (3 per page in ticket strip format).
 */
export function generateBatchPassesPDF(
  attendees: Attendee[],
  settings: AppSettings
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const passesPerPage = 3;
  const passHeight = 84;
  const marginTop = 12;
  const marginSide = 12;
  const pageWidth = 210;
  const usableWidth = pageWidth - marginSide * 2;

  attendees.forEach((attendee, index) => {
    const passIndexOnPage = index % passesPerPage;

    if (index > 0 && passIndexOnPage === 0) {
      doc.addPage();
    }

    const startY = marginTop + passIndexOnPage * (passHeight + 8);

    // Pass Border Card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginSide, startY, usableWidth, passHeight, 2, 2, 'FD');

    // Scissors Cut Line (if not first pass on page)
    if (passIndexOnPage > 0) {
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂ CUT HERE - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', pageWidth / 2, startY - 4, { align: 'center' });
    }

    // Left Column: Camp info & Attendee Identity
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 148, 136); // teal-600
    doc.text(settings.campName.toUpperCase(), marginSide + 8, startY + 10);

    // Status pill
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(marginSide + 8, startY + 13, 38, 5.5, 1.5, 1.5, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text('REGISTRATION CONFIRMED', marginSide + 27, startY + 17, { align: 'center' });

    // Attendee Full Name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(attendee.fullName.toUpperCase(), marginSide + 8, startY + 27);

    // Assembly
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(attendee.churchAssembly || 'General Assembly', marginSide + 8, startY + 33);

    // Registration ID & Financial info grid
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('REG ID', marginSide + 8, startY + 42);
    doc.setFontSize(11);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text(attendee.registrationId, marginSide + 8, startY + 48);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('PAID', marginSide + 42, startY + 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`US$${attendee.amountPaid.toFixed(2)}`, marginSide + 42, startY + 48);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('STATUS', marginSide + 74, startY + 42);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(attendee.paymentStatus === 'Paid / Confirmed' ? 4 : 180, attendee.paymentStatus === 'Paid / Confirmed' ? 120 : 83, attendee.paymentStatus === 'Paid / Confirmed' ? 87 : 9);
    doc.text(attendee.paymentStatus, marginSide + 74, startY + 48);

    if (attendee.balance > 0) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
      doc.text(`Balance Due: US$${attendee.balance.toFixed(2)}`, marginSide + 74, startY + 54);
    }

    // Emergency Contact
    if (attendee.emergencyContactName) {
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Emergency: ${attendee.emergencyContactName} (${attendee.emergencyContactPhone || 'N/A'})`, marginSide + 8, startY + 56);
    }

    // Footer note inside pass
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Venue: ${settings.venue} • Present at Check-in • Pass #${index + 1} of ${attendees.length}`, marginSide + 8, startY + 76);

    // Right Column: QR Code
    const qrDataUrl = getQrDataUrl(null, attendee.registrationId);
    const qrSize = 42;
    const qrX = marginSide + usableWidth - qrSize - 10;
    const qrY = startY + 12;

    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      } catch (e) {
        console.warn('Could not add QR image to batch PDF:', e);
      }
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(qrX, qrY, qrSize, qrSize, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('courier', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(attendee.registrationId, qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
    }

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('SCAN AT GATE', qrX + qrSize / 2, qrY + qrSize + 6, { align: 'center' });

    doc.setFontSize(5.5);
    doc.setFont('courier', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(attendee.verificationToken || attendee.registrationId, qrX + qrSize / 2, qrY + qrSize + 11, { align: 'center' });
  });

  return doc;
}

/**
 * Downloads batch passes as an A4 PDF document.
 */
export function downloadBatchPassesPDF(attendees: Attendee[], settings: AppSettings): void {
  const doc = generateBatchPassesPDF(attendees, settings);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `CampPasses_Batch_${attendees.length}_Passes_${dateStr}.pdf`;
  doc.save(filename);
}
