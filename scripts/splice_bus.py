from pathlib import Path

p = Path("src/parsers/ticketText.ts")
text = p.read_text(encoding="utf-8")
start = text.index("export function parseBusTicket")
end = text.index("function cityOnly")
new = text[:start] + "export { parseBusTicket } from './busTicket';\n\n" + text[end:]
# cityOnly only used by removed bus parser — drop it
cstart = new.index("function cityOnly")
cend = new.index("export function parseTicketText")
new = new[:cstart] + new[cend:]
p.write_text(new, encoding="utf-8")
print("rewrote ticketText.ts")
