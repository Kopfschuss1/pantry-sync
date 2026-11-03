// lib/pantry.ts
var initialPantry = () => ({ products: [], shopping: [], locations: ["Pantry", "Fridge", "Freezer", "Garage"], categories: ["Fruit & veg", "Dairy & eggs", "Meat & fish", "Grains & pasta", "Tins & jars", "Drinks", "Household", "Other"], activity: [] });
var key = (s) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
var round = (n) => Math.round(n * 1e3) / 1e3;
var total = (p, location = "All items") => round(p.batches.filter((b) => location === "All items" || b.location === location).reduce((s, b) => s + b.quantity, 0));
var stockStatus = (p) => total(p) === 0 ? "Out of stock" : total(p) < p.minimum ? "Low stock" : "In stock";
var daysLeft = (date2, now = /* @__PURE__ */ new Date()) => date2 ? Math.round((Date.parse(date2 + "T00:00:00Z") - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5) : null;
var expiryLabel = (date2) => {
  const d = daysLeft(date2);
  return d === null ? "No expiry" : d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? "Expires today" : `${d} ${d === 1 ? "day" : "days"} left`;
};
var hasFraction = (quantity) => !Number.isInteger(round(quantity));
var isOpened = (p) => total(p) > 0 && p.opened === true;
var openQuantity = (p) => !isOpened(p) ? 0 : round(Math.min(1, total(p), typeof p.openedRemaining === "number" && p.openedRemaining > 0 ? p.openedRemaining : round(total(p) % 1) || 1));
var today = () => {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
var openedLabel = (p) => !isOpened(p) ? "" : p.openedOn ? `One unit open \xB7 ${(/* @__PURE__ */ new Date(p.openedOn + "T12:00:00")).toLocaleDateString(void 0, { day: "numeric", month: "short", year: "numeric" })}` : "One unit open \xB7 date unknown";
function normalizePantry(current) {
  const s = structuredClone(current);
  for (const p of s.products) {
    if (p.opened === void 0) {
      const legacy = p.batches.filter((b) => b.quantity > 0 && (!!b.openedOn || hasFraction(b.quantity)));
      p.opened = legacy.length > 0;
      p.openedOn = legacy.map((b) => b.openedOn).filter((d) => !!d).sort()[0] || null;
    }
    const grouped = [];
    for (const b of p.batches) {
      const match = grouped.find((x) => x.location === b.location && x.expiry === b.expiry);
      if (match) match.quantity = round(match.quantity + b.quantity);
      else {
        const copy = { ...b };
        delete copy.openedOn;
        grouped.push(copy);
      }
    }
    p.batches = grouped;
    if (total(p) === 0 || !p.opened) {
      p.opened = false;
      p.openedOn = null;
      p.openedRemaining = null;
    } else p.openedRemaining = openQuantity(p);
  }
  for (const i of s.shopping) i.quantity = Math.max(1, Math.ceil(i.quantity));
  return s;
}
var fold = (s) => key(s).normalize("NFD").replace(/\p{M}/gu, "");
var categoryRules = [
  { category: "Household", aliases: ["Limpeza", "Casa", "Produtos de limpeza", "Higiene"], pattern: /\b(soap|detergent|toilet|tissue|cleaner|kitchen roll|detergente|sabao|sabonete|lixivia|limpeza|papel higienico|rolo de cozinha|guardanapos|champ[oô]|shampoo)\b/ },
  { category: "Drinks", aliases: ["Bebidas"], pattern: /\b(water|juice|coffee|tea|beer|wine|cola|sumo|agua|cafe|cha|cerveja|vinho|bebida|refrigerante)\b/ },
  { category: "Tins & jars", aliases: ["Conservas", "Conservas e frascos", "Enlatados"], pattern: /\b(peanut butter|manteiga de amendoim|molho|polpa|massa de tomate|beans|lentils|chickpeas|oil|jam|tuna|sauce|feijao|grao de bico|lentilhas|atum|azeite|oleo|compota|doce de)\b/ },
  { category: "Dairy & eggs", aliases: ["Laticinios e ovos", "Lacticinios e ovos", "Laticinios", "Lacticinios", "Leite e ovos"], pattern: /\b(milk|cheese|yogurt|yoghurt|butter|eggs?|leite|queijo|iogurtes?|manteiga|ovos?|natas|requeijao|kefir)\b/ },
  { category: "Meat & fish", aliases: ["Carne e peixe", "Carnes e peixe", "Carne e pescado", "Carnes e pescado", "Carne", "Peixe"], pattern: /\b(chicken|beef|pork|salmon|fish|turkey|bacon|frango|carne|porco|vaca|vitela|peru|salmao|peixe|pescada|bacalhau|sardinhas?|camarao|hamburguer|bifes?)\b/ },
  { category: "Grains & pasta", aliases: ["Cereais e massas", "Cereais e massa", "Massas e arroz", "Mercearia"], pattern: /\b(rice|pasta|spaghetti|bread|oats|flour|cereal|arroz|massa|esparguete|pao|paes|aveia|farinha|cereais|flocos|cuscuz|quinoa)\b/ },
  { category: "Fruit & veg", aliases: ["Fruta e legumes", "Frutas e legumes", "Fruta e vegetais", "Fruta", "Legumes"], pattern: /\b(apples?|bananas?|tomatoes?|potatoes?|onions?|carrots?|lemons?|lettuce|broccoli|oranges?|macas?|peras?|tomates?|batatas?|cebolas?|cenouras?|limoes?|limao|alface|brocolos|laranjas?|morangos?|uvas|courgette|abobora|espinafres|cogumelos|pimentos?|alho)\b/ }
];
function categoryTarget(rule, state) {
  const mapped = state.categoryMappings?.[rule.category];
  if (mapped !== void 0) return mapped && state.categories.includes(mapped) ? mapped : null;
  return state.categories.find((c) => [rule.category, ...rule.aliases].some((a) => fold(a) === fold(c))) || null;
}
function categorize(name, state) {
  const existing = state.products.find((p) => key(p.name) === key(name));
  if (existing && existing.category !== "Uncategorized" && state.categories.includes(existing.category)) return existing.category;
  const text = fold(name);
  const match = categoryRules.find((rule) => categoryTarget(rule, state) && rule.pattern.test(text));
  return match ? categoryTarget(match, state) : "Uncategorized";
}
var categorizationMatches = (state) => state.products.filter((p) => p.category === "Uncategorized" && categorize(p.name, state) !== "Uncategorized").length + state.shopping.filter((i) => i.category === "Uncategorized" && categorize(i.name, state) !== "Uncategorized").length;
function reconcileShopping(s) {
  for (const p of s.products) {
    if (p.shoppingDismissedQuantity !== void 0 && p.shoppingDismissedQuantity !== total(p)) delete p.shoppingDismissedQuantity;
    const existing = s.shopping.find((i) => i.productId === p.id || key(i.name) === key(p.name));
    const quantity = Math.max(0, Math.ceil(round(p.target - total(p))));
    if ((total(p) < p.minimum || total(p) === 0) && quantity > 0) {
      if (!existing && p.shoppingDismissedQuantity !== total(p)) s.shopping.push({ id: crypto.randomUUID(), productId: p.id, name: p.name, category: p.category, quantity, automatic: true, bought: false });
      else if (existing && existing.automatic && !existing.bought) {
        if (!existing.quantityOverride) existing.quantity = quantity;
        existing.name = p.name;
        existing.category = p.category;
      }
    } else s.shopping = s.shopping.filter((i) => !(i.productId === p.id && i.automatic && !i.bought));
  }
}
var str = (v, label, max = 100) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max) throw Error(`Enter a valid ${label}.`);
  return v.trim();
};
var num = (v, min = 0) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > 1e5 || round(v) !== v) throw Error("Use a quantity between " + min + " and 100,000, with up to three decimal places.");
  return v;
};
var date = (v) => {
  if (v === null || v === "" || v === void 0) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v).toISOString().slice(0, 10) !== v) throw Error("Choose a valid expiry date.");
  return v;
};
function addBatch(p, location, quantity, expiry) {
  const b = p.batches.find((b2) => b2.location === location && b2.expiry === expiry);
  if (b) b.quantity = num(round(b.quantity + quantity));
  else p.batches.push({ id: crypto.randomUUID(), location, quantity, expiry });
}
var shoppingQuantity = (v) => {
  const n = num(v);
  if (!Number.isInteger(n) || n < 1) throw Error("Shopping quantities must be whole units, at least 1.");
  return n;
};
var quantityLabel = (quantity, unit) => `${quantity} ${quantity === 1 ? { units: "unit", packs: "pack", bottles: "bottle", cans: "can", jars: "jar", bags: "bag", boxes: "box", pieces: "piece" }[unit] || unit : unit}`;
function applyCommand(current, c, actor) {
  const s = normalizePantry(current), p = s.products.find((p2) => p2.id === c.productId);
  const previousStock = new Map(s.products.map((p2) => [p2.id, { quantity: total(p2), opened: isOpened(p2), remaining: openQuantity(p2) }]));
  const location = () => {
    const l = str(c.location, "location");
    if (!s.locations.includes(l)) throw Error("Choose an existing location.");
    return l;
  };
  let message = "";
  const who = actor === "My household" ? "" : `${actor} `;
  if (c.type === "add" || c.type === "restock") {
    const shopping = c.type === "restock" ? s.shopping.find((i) => i.id === c.shoppingId) : void 0;
    if (c.type === "restock" && !shopping) throw Error("Shopping item no longer exists.");
    const name = str(shopping?.name ?? c.name, "product name"), quantity = num(c.quantity, 1e-3), l = location(), expiry = date(c.expiry);
    let product = s.products.find((p2) => key(p2.name) === key(name));
    if (!product) {
      const minimum = num(c.minimum ?? 1), target = num(c.target ?? 2);
      if (target < minimum) throw Error("Target stock must be at least the minimum.");
      const category = typeof c.category === "string" && c.category.trim() ? str(c.category, "category") : categorize(name, s);
      if (category !== "Uncategorized" && !s.categories.includes(category)) throw Error("Choose an existing category.");
      product = { id: crypto.randomUUID(), name, brand: String(c.brand ?? "").slice(0, 100), category, unit: str(c.unit ?? "units", "unit", 30), minimum, target, notes: "", opened: false, openedOn: null, batches: [] };
      s.products.push(product);
    }
    addBatch(product, l, quantity, expiry);
    if (shopping) {
      if (quantity < shopping.quantity) shopping.quantity = Math.ceil(round(shopping.quantity - quantity));
      else s.shopping = s.shopping.filter((i) => i.id !== shopping.id);
    }
    message = `${name}: ${who}added ${quantityLabel(quantity, product.unit)} to ${l} \xB7 ${expiryLabel(expiry)}`;
  } else if (c.type === "adjust" || c.type === "quantity") {
    if (!p) throw Error("Product no longer exists.");
    if (c.type === "adjust" && c.delta !== 1 && c.delta !== -1) throw Error("Invalid stock change.");
    if (c.location !== "All items") location();
    const scoped = c.location === "All items" ? p.batches : p.batches.filter((b) => b.location === c.location);
    const currentQuantity = round(scoped.reduce((n, b) => n + b.quantity, 0));
    const delta = c.type === "quantity" ? round(num(c.quantity) - currentQuantity) : c.delta === -1 && isOpened(p) ? -openQuantity(p) : Number(c.delta);
    if (delta === 0) throw Error("The quantity is already up to date.");
    if (delta < 0) {
      let remaining = Math.min(-delta, currentQuantity);
      if (!remaining) throw Error("There is no stock to remove here.");
      const removed = remaining, changes = [];
      for (const b of [...scoped].sort((a, b2) => (isOpened(p) ? Number(hasFraction(b2.quantity)) - Number(hasFraction(a.quantity)) : 0) || (a.expiry || "9999").localeCompare(b2.expiry || "9999"))) {
        const take = Math.min(remaining, b.quantity);
        if (take) {
          b.quantity = round(b.quantity - take);
          remaining = round(remaining - take);
          changes.push(`${take} from ${b.location} (${expiryLabel(b.expiry)})`);
        }
        if (!remaining) break;
      }
      message = `${p.name}: ${who}consumed ${quantityLabel(removed, p.unit)} \xB7 ${changes.join(", ")}`;
    } else {
      const l = c.location === "All items" ? p.batches.find((b) => b.quantity > 0)?.location || p.batches[0]?.location || s.locations[0] : location();
      addBatch(p, l, delta, null);
      message = `${p.name}: ${who}added ${quantityLabel(delta, p.unit)} to ${l} \xB7 no expiry set`;
    }
  } else if (c.type === "opened") {
    if (!p) throw Error("Product no longer exists.");
    if (typeof c.opened !== "boolean") throw Error("Choose whether one unit is open.");
    if (c.opened && total(p) === 0) throw Error("Add stock before marking a unit as open.");
    p.openedRemaining = c.opened ? openQuantity(p) || round(total(p) % 1) || Math.min(1, total(p)) : null;
    p.opened = c.opened;
    p.openedOn = c.opened ? p.openedOn || today() : null;
    message = `${p.name}: ${who}${c.opened ? "marked one unit as open" : "cleared the open-unit flag"}`;
  } else if (c.type === "deleteProduct") {
    if (!p) throw Error("Product no longer exists.");
    s.products = s.products.filter((x) => x.id !== p.id);
    s.shopping = s.shopping.filter((i) => !(i.automatic && !i.bought && (i.productId === p.id || key(i.name) === key(p.name))));
    for (const i of s.shopping) if (i.productId === p.id) delete i.productId;
    message = `${p.name}: ${who}deleted this product from inventory`;
  } else if (c.type === "edit" || c.type === "saveProduct") {
    if (!p) throw Error("Product no longer exists.");
    const name = str(c.name, "product name");
    if (s.products.some((x) => x.id !== p.id && key(x.name) === key(name))) throw Error("That name already exists. Add stock to that product instead.");
    const minimum = num(c.minimum), target = num(c.target);
    if (target < minimum) throw Error("Target stock must be at least the minimum.");
    const category = str(c.category, "category");
    if (category !== "Uncategorized" && !s.categories.includes(category)) throw Error("Choose an existing category.");
    let batches;
    if (c.type === "saveProduct") {
      if (typeof c.expectedProduct !== "string" || c.expectedProduct !== JSON.stringify(p)) throw Error("This item changed while you were editing. Close and reopen it to review the latest details.");
      if (!Array.isArray(c.batches) || c.batches.length !== p.batches.length) throw Error("Stock entries changed. Reopen the item and try again.");
      if (typeof c.opened !== "boolean") throw Error("Choose whether one unit is open.");
      const seen = /* @__PURE__ */ new Set();
      batches = c.batches.map((b) => {
        if (!b || typeof b !== "object") throw Error("Invalid stock entry.");
        const entry = b;
        if (typeof entry.id !== "string" || seen.has(entry.id) || !p.batches.some((x) => x.id === entry.id)) throw Error("Stock entries changed. Reopen the item and try again.");
        seen.add(entry.id);
        const l = str(entry.location, "location");
        if (!s.locations.includes(l)) throw Error("Choose an existing location.");
        return { id: entry.id, quantity: num(entry.quantity), location: l, expiry: date(entry.expiry) };
      });
    }
    Object.assign(p, { name, category, minimum, target, brand: String(c.brand || "").slice(0, 100), notes: String(c.notes || "").slice(0, 1e3) });
    for (const i of s.shopping.filter((i2) => i2.productId === p.id)) {
      i.name = name;
      i.category = category;
    }
    if (batches) {
      const wasOpened = isOpened(p), remaining = openQuantity(p), openingDate = p.openedOn;
      p.batches = batches;
      p.opened = c.opened === true && total(p) > 0;
      p.openedOn = p.opened ? wasOpened ? openingDate || null : today() : null;
      p.openedRemaining = p.opened ? wasOpened ? remaining : round(total(p) % 1) || Math.min(1, total(p)) : null;
      message = `${name}: ${who}saved product and stock details`;
    } else message = `${name}: updated product details`;
  } else if (c.type === "batch") {
    const b = p?.batches.find((b2) => b2.id === c.batchId);
    if (!p || !b) throw Error("Batch no longer exists.");
    const quantity = num(c.quantity);
    b.quantity = quantity;
    b.expiry = date(c.expiry);
    b.location = location();
    message = `${p.name}: ${who}updated stock in ${b.location} \xB7 ${expiryLabel(b.expiry)}`;
  } else if (c.type === "move") {
    if (!p) throw Error("Product no longer exists.");
    const from = str(c.fromLocation, "source location"), to = location(), quantity = num(c.quantity, 1e-3);
    if (!s.locations.includes(from)) throw Error("Choose an existing source location.");
    if (from === to) throw Error("Choose a different destination location.");
    if (quantity > total(p, from)) throw Error("Not enough stock in this location.");
    let remaining = quantity;
    const source = p.batches.filter((b) => b.location === from && b.quantity > 0).sort((a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999"));
    for (const b of source) {
      const moved = Math.min(remaining, b.quantity);
      b.quantity = round(b.quantity - moved);
      addBatch(p, to, moved, b.expiry);
      remaining = round(remaining - moved);
      if (!remaining) break;
    }
    message = `${p.name}: ${who}moved ${quantityLabel(quantity, p.unit)} from ${from} to ${to}`;
  } else if (c.type === "transfer") {
    const b = p?.batches.find((b2) => b2.id === c.batchId);
    if (!p || !b) throw Error("Batch no longer exists.");
    const quantity = num(c.quantity, 1e-3), l = location();
    if (l === b.location) throw Error("Choose a different location.");
    if (quantity > b.quantity) throw Error("Not enough stock in this batch.");
    const from = b.location;
    b.quantity = round(b.quantity - quantity);
    addBatch(p, l, quantity, b.expiry);
    message = `${p.name}: moved ${quantity} ${p.unit} from ${from} to ${l} \xB7 ${expiryLabel(b.expiry)}`;
  } else if (c.type === "shoppingQuantity") {
    const i = s.shopping.find((i2) => i2.id === c.shoppingId);
    if (!i) throw Error("Shopping item no longer exists.");
    i.quantity = shoppingQuantity(c.quantity);
    i.quantityOverride = true;
    message = `${i.name}: ${who}set shopping quantity to ${i.quantity}`;
  } else if (c.type === "shop") {
    const name = str(c.name, "item name"), quantity = shoppingQuantity(c.quantity), existing = s.shopping.find((i) => key(i.name) === key(name));
    if (existing) {
      existing.quantity = num(round(existing.quantity + quantity));
      existing.automatic = false;
      existing.bought = false;
    } else s.shopping.push({ id: crypto.randomUUID(), name, quantity, category: categorize(name, s), productId: s.products.find((p2) => key(p2.name) === key(name))?.id, automatic: false, bought: false });
    message = `${name}: added ${quantity} to shopping`;
  } else if (c.type === "bought" || c.type === "removeShopping") {
    const i = s.shopping.find((i2) => i2.id === c.shoppingId);
    if (!i) throw Error("Shopping item no longer exists.");
    if (c.type === "bought") {
      i.bought = !i.bought;
      message = `${i.name}: ${i.bought ? "marked bought" : "returned to shopping"}`;
    } else {
      const product = s.products.find((p2) => p2.id === i.productId || key(p2.name) === key(i.name));
      if (product) product.shoppingDismissedQuantity = total(product);
      s.shopping = s.shopping.filter((x) => x.id !== i.id);
      message = `${i.name}: removed from shopping`;
    }
  } else if (["renameCategory", "removeCategory", "renameLocation", "removeLocation"].includes(c.type)) {
    const isCategory = c.type.endsWith("Category"), removing = c.type.startsWith("remove"), label = isCategory ? "category" : "location", list = isCategory ? s.categories : s.locations;
    const old = str(c.name, label, 40);
    if (!list.includes(old)) throw Error(`This ${label} no longer exists.`);
    if (!isCategory && removing && list.length === 1) throw Error("Keep at least one inventory location.");
    const target = str(removing ? c.replacement : c.newName, removing ? "replacement" : "new name", 40);
    if (removing) {
      if (target === old || !(list.includes(target) || isCategory && target === "Uncategorized")) throw Error(`Choose another ${label} for these items.`);
    } else if (list.some((x) => x !== old && key(x) === key(target)) || ["All items", "All categories", "Uncategorized"].some((x) => key(x) === key(target))) throw Error("That name is already in use.");
    if (isCategory) {
      const affected = categoryRules.filter((rule) => categoryTarget(rule, s) === old);
      s.categoryMappings = { ...s.categoryMappings };
      for (const rule of affected) s.categoryMappings[rule.category] = target === "Uncategorized" ? null : target;
      for (const [rule, mapped] of Object.entries(s.categoryMappings)) if (mapped === old) s.categoryMappings[rule] = target === "Uncategorized" ? null : target;
      for (const product of s.products) if (product.category === old) product.category = target;
      for (const item of s.shopping) if (item.category === old) item.category = target;
      s.categories = removing ? list.filter((x) => x !== old) : list.map((x) => x === old ? target : x);
    } else {
      for (const product of s.products) for (const b of product.batches) if (b.location === old) b.location = target;
      s.locations = removing ? list.filter((x) => x !== old) : list.map((x) => x === old ? target : x);
      for (const product of s.products) {
        const grouped = [];
        for (const b of product.batches) {
          const same = grouped.find((x) => x.location === b.location && x.expiry === b.expiry);
          if (same) same.quantity = round(same.quantity + b.quantity);
          else grouped.push(b);
        }
        product.batches = grouped;
      }
    }
    message = removing ? `${who}removed ${label} ${old} \xB7 items reassigned to ${target}` : `${who}renamed ${label} ${old} to ${target}`;
  } else if (c.type === "categorizeUnassigned") {
    let products = 0, shopping = 0;
    for (const product of s.products) if (product.category === "Uncategorized") {
      const next = categorize(product.name, s);
      if (next !== "Uncategorized") {
        product.category = next;
        products++;
      }
    }
    for (const item of s.shopping) if (item.category === "Uncategorized") {
      const next = categorize(item.name, s);
      if (next !== "Uncategorized") {
        item.category = next;
        shopping++;
      }
    }
    if (!products && !shopping) throw Error("No new category matches were found.");
    message = `${who}categorised ${products} ${products === 1 ? "product" : "products"} and ${shopping} shopping ${shopping === 1 ? "item" : "items"}`;
  } else if (c.type === "category" || c.type === "location") {
    const name = str(c.name, c.type, 40), list = c.type === "category" ? s.categories : s.locations;
    if (list.some((x) => key(x) === key(name)) || ["All items", "All categories", "Uncategorized"].some((x) => key(x) === key(name))) throw Error("That name is already in use.");
    if (list.length >= 40) throw Error("You can have up to 40 " + c.type + " entries.");
    list.push(name);
    message = `Added ${c.type}: ${name}`;
  } else throw Error("Unknown action.");
  if (s.products.length > 1e3 || s.shopping.length > 1e3 || s.products.some((p2) => p2.batches.length > 500)) throw Error("Inventory capacity reached. Export your inventory before adding more.");
  for (const product of s.products) {
    const before = previousStock.get(product.id);
    if (before?.opened && isOpened(product) && c.type !== "opened" && total(product) < before.quantity) {
      const left = round(before.remaining - round(before.quantity - total(product)));
      if (left <= 0) {
        product.opened = false;
        product.openedOn = null;
        product.openedRemaining = null;
      } else product.openedRemaining = left;
    }
    if (total(product) === 0) {
      product.opened = false;
      product.openedOn = null;
      product.openedRemaining = null;
    }
  }
  reconcileShopping(s);
  s.activity.unshift({ id: crypto.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString(), actor, text: message });
  s.activity = s.activity.slice(0, 500);
  return s;
}
export {
  applyCommand,
  categorizationMatches,
  categorize,
  daysLeft,
  expiryLabel,
  fold,
  hasFraction,
  initialPantry,
  isOpened,
  key,
  normalizePantry,
  openQuantity,
  openedLabel,
  quantityLabel,
  reconcileShopping,
  round,
  stockStatus,
  today,
  total
};
