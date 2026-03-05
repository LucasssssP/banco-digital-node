const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const db = new sqlite3.Database("./banco.db");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.serialize(() => {

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    amount REAL,
    target TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      balance REAL DEFAULT 0
    )
  `);
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "Usuário já existe" });
      }
      res.json({ message: "Usuário criado com sucesso!" });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (!user) {
        return res.status(400).json({ error: "Login inválido" });
      }
      res.json(user);
    }
  );
});

app.get("/user/:id", (req, res) => {
  db.get(
    "SELECT * FROM users WHERE id = ?",
    [req.params.id],
    (err, user) => {
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
      res.json(user);
    }
  );
});

app.post("/updateBalance", (req, res) => {
  const { id, amount } = req.body;

  db.get("SELECT balance FROM users WHERE id = ?", [id], (err, user) => {
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const novoSaldo = user.balance + amount;

    if (novoSaldo < 0) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    db.serialize(() => {
      db.run("UPDATE users SET balance = ? WHERE id = ?", [novoSaldo, id]);

      const tipo = amount > 0 ? "DEPOSITO" : "SAQUE";

      db.run(
        "INSERT INTO transactions (user_id, type, amount, target) VALUES (?, ?, ?, ?)",
        [id, tipo, Math.abs(amount), null]
      );
    });

    res.json({ message: "Saldo atualizado" });
  });
});
  


// Transferência
app.post("/transfer", (req, res) => {
  const { fromId, toUsername, amount } = req.body;

  if (amount <= 0) {
    return res.status(400).json({ error: "Valor inválido" });
  }

  db.get("SELECT * FROM users WHERE id = ?", [fromId], (err, sender) => {
    if (!sender) {
      return res.status(404).json({ error: "Remetente não encontrado" });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    db.get("SELECT * FROM users WHERE username = ?", [toUsername], (err, receiver) => {
      if (!receiver) {
        return res.status(404).json({ error: "Destinatário não encontrado" });
      }

      db.serialize(() => {
        db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, fromId]);
        db.run("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, receiver.id]);

        // registro remetente
        db.run(
          "INSERT INTO transactions (user_id, type, amount, target) VALUES (?, ?, ?, ?)",
          [fromId, "TRANSFERENCIA_ENVIADA", amount, toUsername]
        );

        // registro destinatário
        db.run(
          "INSERT INTO transactions (user_id, type, amount, target) VALUES (?, ?, ?, ?)",
          [receiver.id, "TRANSFERENCIA_RECEBIDA", amount, sender.username]
        );
      });

      res.json({ message: "Transferência realizada com sucesso!" });
    });
  });
});

app.get("/transactions/:userId", (req, res) => {
  db.all(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC",
    [req.params.userId],
    (err, rows) => {
      res.json(rows);
    }
  );
});

app.get("/transactions-summary/:userId", (req, res) => {
  db.all(
    `
    SELECT 
      DATE(created_at) as date,
      SUM(
        CASE 
          WHEN type IN ('DEPOSITO','TRANSFERENCIA_RECEBIDA') THEN amount
          ELSE -amount
        END
      ) as total
    FROM transactions
    WHERE user_id = ?
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)
    `,
    [req.params.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao gerar resumo" });
      }
      res.json(rows);
    }
  );
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});