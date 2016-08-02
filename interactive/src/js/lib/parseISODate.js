export default function parseISODate(dateStr) {
    let parts = dateStr.split(/[^0-9]/).map(Number);
    let year = parts[0], month = parts[1], day = parts[2], hour = parts[3], min = parts[4], sec = parts[5];
    let date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    return date;
}
