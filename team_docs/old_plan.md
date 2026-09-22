### To figure out how productive a user is going to be at a specific time and to make the correct suggestions for the user at any specific time is a complex problem. I have a proposed solution below: 

## Pipeline for suggesting activities to a user

This pipeline is to train an AI model(s) the best way to organize a user's schedule for maximum productivity, and to give suggestions about what each user would need to become more productive.

## Patameters:

### Energy level throughout the day

To detemine how much energy a user has, we can make a small neural network that specific user. The inputs to the nerual netowrk are things like: The amount of previous work, the time of day it is, the day of the week, how bright it is outside, how productive they generally are at that time, ect. 

This would likely have a dual network archetecutre to determine if a user is actually working or if the user is on a lunch break or something like that. If the user is not at work/working, it doesn't use that data to learn the energy levels.

This netwrok would allow the AI to learn to estimate the energy level of the user just from normal public data and previous work done at each specific hour. 


### Personality Testing

When the user initially joins the system, they should be prompted to take a personality test immediately, or the system can periodically ask questions about the user and use their answers as answers to a personaliy test. 

If the users don't immediately want to take the personality test, the system can give them an average score across everything and gradually learn as they answer questions.

### The Rag Database

Using the energy level, the personality testing, the workload, and other factors, we will take all that data and train a model to turn that into a vector to query the rag database. 

This way the database learns the best kinds of suggestions to return (a competetive suggestion to someone motivated by competition, a curiosity goal to someone with a more curious personality, ect.)

### The LLM

After getting the rag database suggestion, and the predicted energy level, we will craft a prompt for chat gpt for it to do whatever the user wants, such as suggesting something that would help motivate the user.

It may also be a good idea to have the LLM do calendar optimization, howeve, it may also be a good idea to have a neural network or algirthm do that instead.

We plan to use an LLM with an API key as they are the most functional. We will likely avoid training or fine tuning our own model as those model are much smaller and we risk a condition called catestrophic forgetting.

### Training

The rag database and the neural network for the energy levels throughout the day should be able to learn from the amount of work getting done every day. 




### Other ideas:

Using claude agents with personality scores. I haven't used claude agents or skills before, it might be a good thing to look into