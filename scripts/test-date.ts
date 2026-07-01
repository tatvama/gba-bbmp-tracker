const calendarDate = new Date("2026-12-03");
const year = calendarDate.getFullYear();
const month = calendarDate.getMonth();

const firstDayIndex = new Date(year, month, 1).getDay();
const totalDays = new Date(year, month + 1, 0).getDate();

console.log({
  year,
  month,
  firstDayIndex,
  totalDays
});

const cells: (number | null)[] = [];
for (let i = 0; i < firstDayIndex; i++) {
  cells.push(null);
}
for (let i = 1; i <= totalDays; i++) {
  cells.push(i);
}

console.log("Cells length:", cells.length);
console.log("Cells:", cells);
