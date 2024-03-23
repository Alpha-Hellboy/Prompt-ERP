//===PACKAGE IMPORTS START===

const express = require("express");
const app = express();
const path = require("path");
const mailchimp = require("@mailchimp/mailchimp_marketing");
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const expressFileupload = require('express-fileupload');
const fs = require('fs');
const json2xls = require('json2xls');
const { format } = require('date-fns');
const bcrypt = require('bcrypt');

//===PACKAGE IMPORTS END===
const port = process.env.PORT || 3000;
const listId = process.env.listId;
//===SETTINGS START===

app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, 'public')));
mailchimp.setConfig({
  apiKey: process.env.apikey,
  server: process.env.server,  
});
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use(expressFileupload());
app.use(express.json());

//===SETTINGS END===
//===ROUTES START===

app.listen(port, () => {
  console.log(`Listening On Port ${port}`);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo_page.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get("/sign-up", (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'dash-sign-up.html'));
});

app.get("/log-in", (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'dash-sign-in.html'));
});

app.post("/contact", (req, res) => {
  try {
    let subscribingUser = req.body;
    run(subscribingUser);
    res.render("contact.ejs", { message: "Thank you for reaching out! Your message has been successfully submitted." });
  } catch (error) {
    console.error("Error:", error);
    res.render("contact.ejs", { message: "Oops! Something went wrong. Please try again later or contact us through a different method." });
  }
});

async function run(subscribingUser) {
  const response = await mailchimp.lists.addListMember(listId, {
    email_address: subscribingUser.email,
    number: subscribingUser.number,
    status: "subscribed",
    merge_fields: {
      FNAME: subscribingUser.name,
    },
  });
  console.log(`Successfully added contact as an audience member. The contact's id is ${response.id}.`);
}


const mongoURI = process.env.mongoURI;

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true,  connectTimeoutMS: 20000  })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('Error connecting to MongoDB:', err));


const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firmName: {type: String, required: true},
  Number: {type: Number, required: true},
  city: {type: String, required: true},
  reference: {type: String, required: true},
  email: { type: String, required: true, unique: true },
  submissionDate: { type: String,  required: true}, 
});

const User = mongoose.model('User', userSchema);

// Route for the HTML form (replace with your actual path)
app.post('/submit-form', async (req, res) => {
  try {
    const { firstName, firmName, mobileNumber, city , mail, reference } = req.body; // Extract data from request body

    // Validate required fields
    if (!firstName || !firmName || !city|| !mobileNumber || !mail || !reference) {
      // return res.status(400).send('Please fill in all required fields.');
      res.render("demo_page.ejs", {message: "Please fill in all required fields." });
    }

    const existingUser = await User.findOne({ mail }); // Check for existing user

    if (existingUser) {
      // return res.status(409).send('Email already exists.'); // Conflict (409)
      res.render("demo_page.ejs", {message: "Already An Demo Booked Using This Email"});
    }

    const formattedDate = format(new Date(), 'dd-MM-yyyy');

    const newUser = new User({ name : firstName, firmName: firmName, Number : mobileNumber, city , reference: reference, email: mail, submissionDate: formattedDate }); // Create new user

    await newUser.save(); // Save to database

    // res.status(201).send('Form data submitted successfully!'); // Created (201)
    res.render("demo_page.ejs", {message: "Your Demo Booked successfully!"});
  } catch (err) {
    console.error('Error saving form data:', err);
    // res.status(500).send('Internal Server Error'); // Internal Server Error (500)
    res.render("demo_page.ejs", {message: "Internal Server Error"});
  }
});

app.delete('/data/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await User.findByIdAndDelete(id);

    const users = await User.find();

    const tableData = users.map(user => {
      return {
        _id: user._id,
        name: user.name,
        firmName: user.firmName,
        number: user.Number,
        city: user.city,
        reference: user.reference,
        email: user.email,
        submissionDate: user.submissionDate,
      };
    });

    // Redirect or render updated data (implement your logic)
    res.render("data.ejs", { data: tableData }) // Example: Redirect to the data page
  } catch (err) {
    console.error('Error deleting record:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/data/download', async (req, res) => {
  try {
    // Fetch all data from MongoDB collection
    const data = await User.find();

    // Convert data to JSON format
    const jsonData = JSON.stringify(data, null, 2);

    // Create a directory for the temporary file
    const tempDir = path.join(__dirname, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    // Create a temporary JSON file to store the data
    const jsonFilePath = path.join(tempDir, 'data.json');
    fs.writeFileSync(jsonFilePath, jsonData);

    // Convert JSON to Excel format
    const xlsFilePath = path.join(tempDir, 'data.xlsx');
    const xlsData = json2xls(JSON.parse(jsonData));
    fs.writeFileSync(xlsFilePath, xlsData, 'binary');

    // Send the Excel file as a response
    res.download(xlsFilePath, 'data.xlsx', (err) => {
      // Cleanup: Delete the temporary files
      fs.unlinkSync(jsonFilePath);
      fs.unlinkSync(xlsFilePath);
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

const dashUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const dashUser = mongoose.model('Dashboard-User', dashUserSchema);

// Sign-up route
app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Hash the password before saving it to the database
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user in the User collection
    const newUser = new dashUser({
      username: username,
      password: hashedPassword,
    });

    await newUser.save();

    res.redirect("/log-in");
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find the user
    const user = await dashUser.findOne({ username: username });

    if (!user) {
      return res.render("dash-sign-in.ejs", {message: "Invalid Username"});
    }

    // Check the password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.render("dash-sign-in.ejs", {message: "Invalid Password"});
    }

    const users = await User.find();
    const tableData = users.map(user => {
      return {
        _id: user._id,
        name: user.name,
        firmName: user.firmName,
        number: user.Number,
        city: user.city,
        reference: user.reference,
        email: user.email,
        submissionDate: user.submissionDate,
      };
    });
    res.render('data.ejs', { data: tableData });

  } catch (error) {
    console.error('Error logging in:', error);
    return res.render("dash-sign-in.ejs", {message: "Internal Server Error"});
  }
});

app.get("*", (req,res) => {
  res.render("404.ejs");
});