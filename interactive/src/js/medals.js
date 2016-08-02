import './polyfill/classList.min'

import { $, $$ } from './lib/selector'
import RelativeTime from './lib/relative'
import reqwest from 'reqwest'

import './schedule'

let lbButton = $('.js-leaderboard-button')
let rButton = $('.js-recent-button')
let tableEl = $('.js-table');
let emptyRowEl = $('.js-row-empty');

let countryCache = {}

RelativeTime.setNow(Date.now())

if ($$('.om-table-row--extra').length > 0) {
    lbButton.style.display = 'block';
    lbButton.addEventListener('click', e => {
        lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
        tableEl.classList.toggle('is-expanded');
        lbButton.classList.toggle('hide-button')
    })
};

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let recentContainer = $('.om-recent-days')
let countryContainer = $('.om-country')

function ordinal(num) {
    if([11,12,13].indexOf(num % 100) > -1){
        return num + 'th'
    }
    else if(num % 10 === 1){
        return num + 'st'
    }
    else if(num % 10 === 2){
        return num + 'nd'
    }
    else if(num % 10 === 3){
        return num + 'rd'
    }
    return num + 'th'
}

function changeCountry() {
    let identifier = cSelect.options[cSelect.selectedIndex].value

    function render(country) {
        countryCache[identifier] = country
        countryContainer.innerHTML = country

        $$('.om-country-timestamp').forEach(el => {
            RelativeTime.processEl(el)
        })

        let row = $(`.om-table-row[data-id="${identifier}"]`);
        if (!row) {
            row = emptyRowEl.cloneNode(true);
            row.querySelector('.om-table-row__flag').classList.add(`om-flag--${identifier}`);
            row.querySelector('.om-table-row__country').textContent = identifier;
        }

        let posSpan = $('.om-position-ordinal')
        posSpan.innerHTML = ordinal(parseInt(row.getAttribute('data-position')))

        let favouriteTable = $('.om-table--favourite')
        favouriteTable.innerHTML = row.outerHTML;

        let cmButton = $('.js-country-medals-button')
        if(cmButton){
            cmButton.addEventListener('click', e => {
                let medals = $$('.om-country-medal-entry')
                medals.slice(5).forEach(m => m.classList.toggle('om-is-hidden'))
                cmButton.innerHTML = (cmButton.innerHTML === 'All medals') ? 'Fewer medals' : 'All medals'
            })
        }
    };

    if (countryCache[identifier]) {
        render(countryCache[identifier]);
    } else {
        reqwest(`./medals/countries/countryMedals-${identifier}.html`).then(render);
    }
}

cSelect.addEventListener('change', () => {
    changeCountry()
})

// select GBR by default
cSelect.selectedIndex = [].slice.apply(cSelect.options).map(o => o.value).indexOf('GBR');
changeCountry()
