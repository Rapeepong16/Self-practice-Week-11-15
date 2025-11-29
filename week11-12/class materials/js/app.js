import { loadQuotes } from "./qouteManagement.js"

document.addEventListener("DOMContentLoaded", async () => {
  const quotes = await loadQuotes()
  console.log(quotes)
  const quoteListEle = document.getElementById("quoteList")
  quotes.forEach((quote) => {
    const quoteCardEle = newQuoteCard(quote)
    quoteListEle.appendChild(quoteCardEle)
  })
})
function newQuoteCard(quote) {
  // <div class="quote-card" data-id="1">
  const divEle = document.createElement("div")
  divEle.className = "quote-card"
  divEle.dataset.id = quote.id
  // <p>No one is perfect</p>
  const pQuote = document.createElement("p")
  pQuote.textContent = quote.content
  divEle.appendChild(pQuote)
  //<p class="author">someone</p>
  const pAuthor = document.createElement("p")
  pAuthor.className = "author"
  pAuthor.textContent = quote.author
  divEle.appendChild(pAuthor)

  //<div class="actions">
  const divActionsEle = document.createElement("div")
  divActionsEle.className = "actions"

  //  <button class="edit" data-id="1">Edit</button>
  const editButtonEle = document.createElement("button")
  editButtonEle.className = "edit"
  editButtonEle.dataset.id = quote.id
  editButtonEle.textContent = "Edit"
  divActionsEle.appendChild(editButtonEle)
  // <button class="delete" data-id="1">delete</button>
  const deleteButtonEle = document.createElement("button")
  deleteButtonEle.className = "delete"
  deleteButtonEle.dataset.id = quote.id
  deleteButtonEle.textContent = "Delete"
  divActionsEle.appendChild(deleteButtonEle)

  divEle.appendChild(divActionsEle)
  return divEle //
}
//create html quote cards
//   <div class="quote-card" data-id="1">
//    <p>No one is perfect</p>
//    <p class="author">someone</p>
//    <div class="actions">
//         <button class="edit" data-id="1">Edit</button>
//         <button class="delete" data-id="1">delete</button>
//    </div>
// </div>
 

