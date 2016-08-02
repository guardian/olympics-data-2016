import parseISODate from './parseISODate'

function fmt(h, m) {
    let pad = n => (n < 10 ? '0' : '') + n;
    return `${pad(h)}:${pad(m)}`;
}

export default function formatTime(today, timeEls, tzEl) {
    let todayDate = parseInt(today.split('-')[2], 10);

    timeEls.map(timeEl => {
        let date = parseISODate(timeEl.getAttribute('datetime'));
        let time = fmt(date.getHours(), date.getMinutes());
        let nextDay = date.getDate() !== todayDate;
        return {'el': timeEl, time, nextDay};
    }).forEach(t => {
        t.el.textContent = t.time;
        if (t.nextDay) t.el.classList.add('is-next-day');
        else t.el.classList.remove('is-next-day');
    });

    let offset = new Date().getTimezoneOffset();
    let tzSign = offset > 0 ? '-' : '+', absOffset = Math.abs(offset);
    tzEl.textContent = `your local time (UTC${tzSign}${fmt(Math.floor(absOffset / 60), absOffset % 60)})`;
}
