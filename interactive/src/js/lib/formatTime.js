import parseISODate from './parseISODate'
import { getQueryString } from './queryParameters'

function fmt(h, m) {
    let pad = n => (n < 10 ? '0' : '') + n;
    return `${pad(h)}:${pad(m)}`;
}

var timezones = {
    "UK": {
        "+01:00": "BST"
    },
    "US": {
        "-07:00": "PDT",
        "-06:00": "MDT",
        "-05:00": "CDT",
        "-04:00": "EDT"
    },
    "AU": {
        "+09:30": "ACST",
        "+10:00": "AEST"
    },
    "INT": {}
}

export default function formatTime(today, timeEls, tzEl) {
    var edition = getQueryString('edition');

    if(!edition) {
        edition = "INT";
    }

    let todayDate = parseInt(today.split('-')[2], 10);

    if (!tzEl) return;

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

    let offsetString = tzSign + fmt(Math.floor(absOffset / 60), absOffset % 60);
    let timezoneString = (timezones[edition][offsetString]) ? timezones[edition][offsetString] : "";

    tzEl.textContent = (timezoneString) ? timezoneString : "UTC" + offsetString;
}
