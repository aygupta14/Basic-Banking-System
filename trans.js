const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const port = process.env.PORT || 3026;

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost', // Replace with your MySQL server host
    user: 'root',      // Replace with your MySQL username
    password: 'aygupta14@',  // Replace with your MySQL password
    database: 'bank',  // Replace with your MySQL database name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Serve the HTML file from the specified directory
const htmlFilePath = 'transfer.html'; // Replace with the path to your HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, htmlFilePath));
});

// Define a route to retrieve customer data
app.get('/customers', (req, res) => {
    // SQL query to select customer data from the 'customers' table
    const query = 'SELECT customer_id, first_name, last_name, email, address, balance FROM customers';

    // Use the pool to get a connection and execute the query
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        // Send the customer data as JSON
        res.json(results);
    });
});

// Define a route to fetch customer account data
app.get('/customerAccountData', (req, res) => {
    // Modify the query to fetch customer account data from the 'customer' table
    const query = 'SELECT customer_id FROM customers';

    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        const customerIds = results.map(result => result.customer_id);

        // Send the customer IDs as JSON
        res.json(customerIds);
    });
});


// Define a route to handle money transfer
app.post('/transferMoney', (req, res) => {
    const fromAccount = req.body.fromAccount;
    const toAccount = req.body.toAccount;
    const amount = parseFloat(req.body.amount);

    // Retrieve the current balances of the sender and recipient accounts
    const querySender = 'SELECT balance FROM customers WHERE customer_id = ?';
    const queryRecipient = 'SELECT balance FROM customers WHERE customer_id = ?';

    // Use the pool to get connections and execute the queries
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting a connection:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        connection.beginTransaction((err) => {
            if (err) {
                console.error('Error starting a transaction:', err);
                res.status(500).json({ error: 'Internal Server Error' });
                connection.release();
                return;
            }

            connection.query(querySender, [fromAccount], (err, senderResult) => {
                if (err) {
                    console.error('Error querying sender balance:', err);
                    connection.rollback(() => {
                        res.status(500).json({ error: 'Internal Server Error' });
                        connection.release();
                    });
                    return;
                }

                const senderBalance = parseFloat(senderResult[0].balance);

                if (senderBalance < amount) {
                    console.error('Insufficient balance for the transfer');
                    connection.rollback(() => {
                        res.status(400).json({ error: 'Insufficient Balance' });
                        connection.release();
                    });
                    return;
                }

                connection.query(queryRecipient, [toAccount], (err, recipientResult) => {
                    if (err) {
                        console.error('Error querying recipient balance:', err);
                        connection.rollback(() => {
                            res.status(500).json({ error: 'Internal Server Error' });
                            connection.release();
                        });
                        return;
                    }

                    const recipientBalance = parseFloat(recipientResult[0].balance);

                    // Calculate the new balances after the money transfer
                    const newSenderBalance = senderBalance - amount;
                    const newRecipientBalance = recipientBalance + amount;

                    // Update the sender's balance
                    const updateSenderQuery = 'UPDATE customers SET balance = ? WHERE customer_id = ?';
                    connection.query(updateSenderQuery, [newSenderBalance, fromAccount], (err) => {
                        if (err) {
                            console.error('Error updating sender balance:', err);
                            connection.rollback(() => {
                                res.status(500).json({ error: 'Internal Server Error' });
                                connection.release();
                            });
                            return;
                        }

                        // Update the recipient's balance
                        const updateRecipientQuery = 'UPDATE customers SET balance = ? WHERE customer_id = ?';
                        connection.query(updateRecipientQuery, [newRecipientBalance, toAccount], (err) => {
                            if (err) {
                                console.error('Error updating recipient balance:', err);
                                connection.rollback(() => {
                                    res.status(500).json({ error: 'Internal Server Error' });
                                    connection.release();
                                });
                                return;
                            }

                            // Commit the transaction
                            connection.commit((err) => {
                                if (err) {
                                    console.error('Error committing the transaction:', err);
                                    connection.rollback(() => {
                                        res.status(500).json({ error: 'Internal Server Error' });
                                        connection.release();
                                    });
                                    return;
                                }

                                // Send a response indicating success
                                res.status(200).json({ message: 'Transaction Successful' });
                                connection.release();
                            });
                        });
                    });
                });
            });
        });
    });
});

// Start the Express.js server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
