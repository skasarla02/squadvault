import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface ProofOfFundsVault {
  id: string;
  title: string;
  merchantName: string;
  goalAmountCents: number;
}

interface ProofOfFundsPledge {
  userName: string;
  shareAmountCents: number;
  holdStatus: string;
}

export async function generateProofOfFundsPdf(vault: ProofOfFundsVault, pledges: ProofOfFundsPledge[]) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const line = (text: string, size = 11, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(text, { x: 50, y, size, font: useFont, color });
    y -= size + 10;
  };

  line("SquadVault", 22, bold, rgb(0.06, 0.6, 0.4));
  line("Proof of Funds Certificate", 14, bold);
  y -= 6;
  line(`Vault: ${vault.title}`, 12, bold);
  line(`Merchant: ${vault.merchantName}`);
  line(`Total authorized: $${(vault.goalAmountCents / 100).toFixed(2)} USD`);
  line(`Generated: ${new Date().toLocaleString()}`);
  y -= 10;
  line("This certifies that the group below fully funded and authorized payment", 10);
  line("holds for the amount above via Stripe (test mode).", 10);
  y -= 16;
  line("Members", 13, bold);
  for (const p of pledges) {
    line(`${p.userName} — $${(p.shareAmountCents / 100).toFixed(2)} — ${p.holdStatus}`, 10);
  }
  y -= 10;
  line("This is a simulated test-mode certificate for demonstration purposes only.", 9, font, rgb(0.55, 0.55, 0.55));

  return pdfDoc.save();
}
