export function $(el, s) {
    if (!s) { s = el; el = document; }
    return el.querySelector(s);
}

export function $$(el, s) {
    if (!s) { s = el; el = document; }
    return [].slice.apply(el.querySelectorAll(s));
}
