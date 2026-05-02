// ==================== JOKES & QUESTIONS ====================

const jokes = [
  "Why don't scientists trust atoms? Because they make up everything.",
  "I told my wife she was drawing her eyebrows too high. She looked surprised.",
  "Why do cows wear bells? Because their horns don't work.",
  "I asked the librarian if they had books about paranoia. She whispered: they're right behind you.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
  "Why don't eggs tell jokes? They'd crack each other up.",
  "I used to hate facial hair but then it grew on me.",
  "What do you call a fake noodle? An impasta."
];

const questions = [
  { q: "How are you feeling today?", opts: ["Amazing!", "Pretty good", "Meh", "Send help"] },
  { q: "Did you pet any animal today?", opts: ["Yes, a dog!", "Yes, a cat!", "No sadly", "I am the animal"] },
  { q: "How long would you stay in freezing cold water?", opts: ["0 seconds", "10 seconds", "1 minute", "I live there"] },
  { q: "What is your current energy level?", opts: ["100%", "50%", "20%", "Please recharge me"] },
  { q: "Have you drunk enough water today?", opts: ["Yes!", "Probably not", "Does tea count?", "Water? Never heard of it"] },
  { q: "What would you rather do right now?", opts: ["Dance", "Sleep", "Eat", "Disappear"] },
  { q: "How is your week going?", opts: ["Flying!", "Surviving", "It's a week", "Declining to answer"] },
  { q: "Last thing that made you laugh?", opts: ["A meme", "A person", "Myself", "Nothing lately"] },
  { q: "Would you rather fight one big duck or 10 small ducks?", opts: ["One big duck", "10 small ducks", "I run", "I befriend them"] },
  { q: "What is your spirit animal today?", opts: ["A cat (unbothered)", "A dog (excited)", "A sloth (tired)", "A raccoon (chaotic)"] }
];

const randomOutcomes = [
  { msg: "Wygrales 5 rycarow!", rare: true },
  { msg: "Wygrales 100!", rare: true },
  { msg: "Niestety nic... Sprobuj jutro!", rare: false },
  { msg: "Prawie! Ale jednak nie.", rare: false },
  { msg: "Los mowi: dzisiaj nie.", rare: false },
  { msg: "Moze jutro bedzie lepiej!", rare: false },
  { msg: "Puste kieszenie, pelne serce.", rare: false },
  { msg: "Wszechswiat sie zastanawia...", rare: false },
  { msg: "Nie tym razem, przyjacielu.", rare: false },
  { msg: "Sprobuj jeszcze raz jutro!", rare: false }
];

function getDailyJoke() {
  const dayIndex = Math.floor(Date.now() / (12 * 60 * 60 * 1000)) % jokes.length;
  return jokes[dayIndex];
}

function getDailyQuestion() {
  const dayIndex = Math.floor(Date.now() / (12 * 60 * 60 * 1000)) % questions.length;
  return questions[dayIndex];
}

function getRandomOutcome() {
  const rand = Math.random();
  if (rand < 0.05) return randomOutcomes[0]; // 5% chance Wygrales 5 rycarow
  if (rand < 0.08) return randomOutcomes[1]; // 3% chance Wygrales 100
  const others = randomOutcomes.filter(function(o) { return !o.rare; });
  return others[Math.floor(Math.random() * others.length)];
}

module.exports = { getDailyJoke, getDailyQuestion, getRandomOutcome };