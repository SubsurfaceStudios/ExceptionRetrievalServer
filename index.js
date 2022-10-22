const rsa = require('node-rsa');
const mongo = require('mongodb');
const fs = require('node:fs');
const { stdin, stdout } = require('node:process');
const rl = require('node:readline');

const cfg = require('./private/config.json');

const i = rl.createInterface(stdin, stdout);

function query() {
    i.question("Select an option: UPLOAD | READ | DUMP | FLUSH | QUIT\n", async a => {
        switch (a.toLowerCase()) {
            case "upload": {
                const r = new rsa()
                    .importKey(
                        fs.readFileSync(cfg.public_key_path).toString('utf-8'),
                        cfg.public_key_format
                    );
    
                i.question("Enter data.\n", async data => {
                    var client = new mongo.MongoClient(cfg.mongodb_connection_string);
                    await client.connect();
                    
                    const ret = r.encrypt(data, 'buffer');
                    const collection = client.db(cfg.mongodb_database_name).collection("exception_reports");
                    await collection.insertOne(
                        {
                            "data": ret
                        }
                    );
                    i.write("Uploaded data encrypted with public key.\n");
                    query();
                    return;
                });
                return;
            }
            case "dump": {
                const r = new rsa().importKey(fs.readFileSync(cfg.private_key_path).toString('utf-8'), cfg.private_key_format);
    
                var client = new mongo.MongoClient(cfg.mongodb_connection_string);
                await client.connect();
    
                const data = (await client.db(cfg.mongodb_database_name).collection("exception_reports").find({_id: {$exists: true}}).toArray())
                    .map(x => `            ${x._id}:\n\n${r.decrypt(x.data.buffer, 'buffer').toString('utf-8')}`);
                
                console.log("Data successfully decrypted locally, dumping to file.")
                
                fs.writeFileSync(cfg.dump_file_path, data.join("\n\n------------------------------------------------\n"));

                console.log(`Data dumped to ${cfg.dump_file_path}`);
                return;
            }
            case "read": {
                const r = new rsa().importKey(fs.readFileSync(cfg.private_key_path).toString('utf-8'), cfg.private_key_format);
    
                var client = new mongo.MongoClient(cfg.mongodb_connection_string);
                await client.connect();
    
                const data = (await client.db(cfg.mongodb_database_name).collection("exception_reports").find({ _id: { $exists: true } }).toArray())
                    .map(x => r.decrypt(x.data.buffer, 'buffer').toString('utf-8'))
                    .map(x => JSON.parse(x))
                    .map(x => delete x.stack_trace);
                
                console.table(data);
                query();
                return;
            }
            case "flush": {
                console.log("Flushing reports...");
                var client = new mongo.MongoClient(cfg.mongodb_connection_string);
                await client.connect();

                await client.db(cfg.mongodb_database_name).collection("exception_reports").deleteMany({});
                
                console.log("Flushed all exception reports.");

                query();
                return;
            }
            case "quit": {
                process.exit(0);
                return;
            }
            default: {
                query();
            }
        }
    });
}

query();