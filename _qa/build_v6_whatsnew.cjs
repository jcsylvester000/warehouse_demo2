const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } = require('docx');
const OUT = process.argv[2];
const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
const styles = {
  default: { document: { run: { font: 'Arial', size: 22 } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: 'Arial', color: '1F3864' }, paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 0 } },
  ],
};
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const P = (t) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun(t)] });
// one change row: bold code + name, then Issue / Fix lines
function item(code, name, issue, fix) {
  return [
    new Paragraph({ spacing: { before: 80, after: 20 }, children: [new TextRun({ text: code + ' — ' + name, bold: true, color: '2E5496' })] }),
    new Paragraph({ spacing: { after: 10 }, indent: { left: 360 }, children: [new TextRun({ text: 'Issue: ', bold: true }), new TextRun(issue)] }),
    new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: 'Fix: ', bold: true }), new TextRun(fix)] }),
  ];
}
const title = [
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Carease Health — Warehouse (WMS)', bold: true, size: 24, color: '2E5496' })] }),
  new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "What's New — V6 Changes (Issue → Fix)", bold: true, size: 38, color: '1F3864' })] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'The most recent supervisor requests — what was wrong and how we fixed it · 2026-06-25', italics: true, size: 22, color: '595959' })] }),
];
const children = [].concat(
  title,
  [H1('Open questions')],
  item('Q1', 'What makes an assembly', 'Unclear whether an assembly could combine multiple groups + multiple items.', 'Confirmed and verified — the model already supports a composition of multiple groups and multiple items.'),
  item('Q2', 'Cart Type values', '"Standard / Bariatric / Compact" were meaningless placeholders.', 'Removed. Cart type now comes from the managed cart-type list (EDAN / VS8 / Accutor), which you can add to or rename.'),
  [H1('Inventory')],
  item('INV-1', 'Add filters', 'Hard to find items in a long list.', 'Added filter chips: Single items, Grouped items, Carts available, Low stock.'),
  item('INV-2', '"Ship only as an assembly" on groups', 'The flag existed only on single items, so a master full-cart group could be shipped loose.', 'Added the flag to groups. A master group can only ship as an assembly, but its individual parts (a basket, handle, BP machine) still ship loose.'),
  [H1('Purchase Orders')],
  item('PO-1', 'Group dropdown default', 'A group line opened expanded.', 'Group lines now default collapsed; open one to see what is inside.'),
  item('PO-2', 'Deposit currency symbol', 'No "$" next to the deposit amount.', 'Added a "$" beside the deposit field.'),
  item('PO-3', 'Prefill remaining payment', 'You had to retype the remaining balance.', 'The next payment prefills the remaining balance and stays editable.'),
  item('PO-4', 'Landed cost vs amount owed', 'A landed cost (e.g. the vendor billed extra shipping) was never counted in the amount owed.', 'Each landed cost has a "bill us" toggle — ticked adds it to the amount owed to the vendor; unticked means it was paid externally.'),
  [H1('Sales Orders')],
  item('SO-2', 'Always allow Print', 'Print needed to work at any time.', 'Print is available before and after, not gated by status.'),
  item('SO-3', 'BUG — confirm did not create a shipment', 'Confirming an SO did nothing in the shipping queue.', 'Confirm now queues a shipment (and will not duplicate it).'),
  item('SO-4', 'BUG — stock showing 0', 'After editing an SO, available units read 0 and wrongly forced a back order.', 'Availability for an assembly line now reads the real built-unit count in the warehouse.'),
  item('SO-5', 'Line-item unit picker', 'No way to pick specific units, no new-vs-refurbished distinction, no cap at stock.', 'Each assembly line has a New / Refurbished pool selector, units are R-tagged when refurbished, and selection is capped at what is available (the shortfall goes to a back order).'),
  item('SO-1', 'Hide Send after received', 'Send should disappear once an order is received.', 'Still outstanding (a PO-flow behaviour) — queued for the next pass.'),
  [H1('Assemblies')],
  item('AS-1', 'Components support groups', 'The component picker appeared to show single items only.', 'Verified the picker offers groups and singles.'),
  item('AS-2', 'Fields traced from inventory', 'Asset fields were typed fresh at build time, not traced from inventory.', 'Auto-fill now traces values from the inventory groups/items inside the assembly (e.g. CTA → Cart Type/Key, VS8 → BP device).'),
  item('AS-3', 'Which assembly am I building?', 'The build screen did not make the assembly type clear.', 'A dropdown to choose the assembly type now sits at the top of both the single-build and multi-build screens.'),
  item('AS-4', 'Landed cost carries into the build', 'Needed confirming.', 'Confirmed working ($5 / $7.50 parts show as $12.50 in the build).'),
  item('AS-5', 'Build multiple at once', 'Building carts one at a time was too slow.', 'New "Build multiple" line-item screen — add a row per cart (code / colour / tablet number) and build them all at once; auto-fill is shown and parts leave inventory.'),
  [H1('Carts as Assets & Refurbished')],
  item('CA-1', 'Carts are not inventory', 'Needed confirming that a cart exists only as an asset, created at assembly.', 'Confirmed — assembling consumes the parts and creates exactly one asset.'),
  item('CA-2', 'Returned cart = Refurbished (separate pool)', 'Returned carts needed to become a separate refurbished pool, with the SO choosing the pool (no auto-pick).', 'Confirming a cart return flips it to Refurbished in its own pool. The SO ship picker chooses New vs Refurbished and never auto-mixes; Inventory shows a Condition column.'),
  item('CA-3', 'Refurbished value from the refund logic', 'The value depends on a refund formula that is not finalised.', 'Implemented as one swappable function: refurbished value = book cost × a credit rate (default 80%, editable on the Returns page). When you set the real formula, change that one function and the whole app follows.'),
  [H1('Fresh data for testing (new request)')],
  item('DATA', 'Empty Purchase Orders, Sales Orders & Returns', 'The supervisor wants to test these with fresh data he inputs.', 'The app now starts with no Purchase Orders, Sales Orders or Returns (and no demo bills, shipments or sent emails). Inventory, assets, vendors and facilities remain. "Reset demo data" returns to this same clean state.'),
  [H1('Verification')],
  [P('All automated checks pass: 12 test suites totalling 391 checks, run three times with zero failures; the production build is clean.')],
);
const doc = new Document({ styles, sections: [{ properties: { page: PAGE }, children }] });
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT + "/Warehouse WMS - What's New - V6 Changes (Issue to Fix).docx", b); console.log('wrote V6 Issue-to-Fix doc'); });
