export function $(s) {
    return document.querySelector(s);
}

export function $$(s) {
    return [].slice.apply(document.querySelectorAll(s));
}
