import {
  loadQuotes,
  deleteQuote,
  addQuote,
  editQuote,
} from "./quoteManagement.js"

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
  editButtonEle.addEventListener("click", handleEdit)

  // <button class="delete" data-id="1">delete</button>
  const deleteButtonEle = document.createElement("button")
  deleteButtonEle.className = "delete"
  deleteButtonEle.dataset.id = quote.id
  deleteButtonEle.textContent = "Delete"
  divActionsEle.appendChild(deleteButtonEle)
  deleteButtonEle.addEventListener("click", handleDelete)

  divEle.appendChild(divActionsEle)
  return divEle //
}
function handleEdit(e) {
  const editId = e.target.dataset.id
  // console.log(editId)
  const editQuoteDivEle = document.querySelector(`div[data-id="${editId}"]`)
  const formEle = document.getElementById("quoteForm")
  formEle.quoteId.value = editId //store edit id for handle edit case
  formEle.content.value = editQuoteDivEle.children[0].textContent
  formEle.author.value = editQuoteDivEle.children[1].textContent
}
async function handleDelete(e) {
  //e=event object
  // console.log(e.target.dataset.id)
  const removeId = e.target.dataset.id
  const ans = confirm(`Do you want to delete quote: ${removeId} `)
  if (ans) {
    try {
      //1. delete quote in the backend
      const deletedId = await deleteQuote(removeId)
      // console.log(deletedId)
      //2. find remove quote div element
      const removeQuoteDivEle = document.querySelector(
        `div[data-id="${deletedId}"]`
      )
      // console.log(removeQuoteDivEle)
      const quoteListEle = document.querySelector("#quoteList")
      console.log(quoteListEle)
      //3. delete quote div element
      quoteListEle.removeChild(removeQuoteDivEle)
    } catch (e) {
      alert(`App: ${e.message}`)
    }
  }
}

const formEle = document.getElementById("quoteForm")
formEle.addEventListener("submit", handleAddEdit)

async function handleAddEdit(event) {
  event.preventDefault()
  const quoteId = formEle.quoteId.value
  const newContent = formEle.content.value
  const newAuthor = formEle.author.value

  if (quoteId) {
    //EDIT
    try {
      const updateQuote = await editQuote({
        id: quoteId,
        content: newContent,
        author: newAuthor,
      })
      const updateQuoteDivEle = document.querySelector(
        `div[data-id="${updateQuote.id}"]`
      )
      updateQuoteDivEle.children[0].textContent = updateQuote.content
      updateQuoteDivEle.children[1].textContent = updateQuote.author
    } catch (e) {
      console.log(`App [Edit]: ${e.message}`)
    }
  } else {
    //ADD
    try {
      //1. add new Item in the backend
      const newQuote = await addQuote({
        content: newContent,
        author: newAuthor,
      }) //{content:content, author:author}
      //2. add new quote card
      const newQuoteDivEle = newQuoteCard(newQuote)
      const quoteListEle = document.getElementById("quoteList")
      quoteListEle.appendChild(newQuoteDivEle)
    } catch (e) {
      alert(`App [Add]: ${e.message}`)
    }
  }

  //3. clear form
  formEle.quoteId.value = ""
  formEle.content.value = ""
  formEle.author.value = ""

  //ADD
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
