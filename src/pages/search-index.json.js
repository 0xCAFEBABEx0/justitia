import { laws } from "../lib/data.ts";
const STATUS = { in_force: 0, repealed: 1, upcoming_only: 2 };
export const GET = () => {
    const rows = laws().map((l) => [l.id, l.title, l.kana ?? "", l.abbrev ?? "", l.num, STATUS[l.status]]);
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
};
