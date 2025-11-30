//CRUD on any items
//GET
async function getItems(url) {
    let message = ""
    try {
        const res = await fetch(url) //fetch returns respnse object
        console.log(res)
        if (!res.ok) {
            switch (res.status) {
                case 404:
                    message = "404 - Item not found"
                    break
                case 409:
                    message = "409 - Conflict"
                    break
                default:
                    message = "Fail to get item, please try again"
            }
            throw new Error(message)
        }
        const data = await res.json() //json() converts json string to JavaScript object
        console.log(data)
        return data
    } catch (error) {
        throw new Error(error.message)
    }
}

//POST
async function addItem(url, item) {
    try {
        const res = await fetch(`${url}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(item),
        })
        if (res.status !== 201) throw new Error("Fail to add item")
        const addedItem = res.json()
        return addedItem
    } catch (error) {
        throw new Error(error.message)
    }
}

//PUT
async function editItem(url, item) {
    try {
        const res = await fetch(`${url}/${item.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(item),
        })
        if (res.status !== 200) throw new Error("Fail to edit item")
        const editedItem = res.json()
        return editedItem
    } catch (error) {
        throw new Error(error.message)
    }
}
//DELETE
async function deleteItem(url, id) {
    try {
        const res = await fetch(`${url}/${id}`, { method: "DELETE" })
        if (!res.ok) throw new Error("Fail to delete item")
        return id
    } catch (error) {
        throw new Error(error.message)
    }
}

export { getItems, deleteItem, addItem, editItem }
