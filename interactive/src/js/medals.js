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

lbButton.addEventListener('click', e => {
    lbButton.innerHTML = (lbButton.innerHTML === 'Hide countries') ? 'All countries' : 'Hide countries'
    tableEl.classList.toggle('is-expanded');
    lbButton.classList.toggle('hide-button')
})

let dSelect = $('.om-select-discipline')
let cSelect = $('.om-select-country')
let recentContainer = $('.om-recent-days')
let countryContainer = $('.om-country')

function ordinal(num) {
    if([11,12,13].includes(num % 100)){
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
    let p = countryCache[identifier] ? Promise.resolve(countryCache[identifier]) :
        Promise.resolve(reqwest(`./medals/countries/countryMedals-${identifier}.html`))

    p.then(country => {

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
    })
}

cSelect.addEventListener('change', () => {
    changeCountry()
})

// select GBR by default
cSelect.selectedIndex = Array.from(cSelect.options).find(o => o.value === 'GBR').index
changeCountry()
