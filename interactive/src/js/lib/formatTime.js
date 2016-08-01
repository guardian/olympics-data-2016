import parseISODate from './parseISODate'

function time(h, m) {
    let pad = n => (n < 10 ? '0' : '') + n;
    return `${pad(h)}:${pad(m)}`;
}

export default function formatTime(timeEls, tzEl) {
    timeEls.forEach(timeEl => {
        let date = parseISODate(timeEl.getAttribute('datetime'));
        timeEl.textContent = time(date.getHours(), date.getMinutes());
    });

    let offset = new Date().getTimezoneOffset();
    let tzSign = offset > 0 ? '-' : '+', absOffset = Math.abs(offset);
    tzEl.textContent = tzSign + time(Math.floor(absOffset / 60), absOffset % 60);
}
