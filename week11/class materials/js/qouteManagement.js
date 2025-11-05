import { getItem } from "./myLib/fetchUtils"
async function loadQuotes() {
    try {
        const quotes = await getItem(`${import.meta.env.VITE_APP_URL}/quotes`)
        console.log(quotes);
        return quotes
    } catch (error) {
        alert(error)
    }
    
}
 export {loadQuotes}