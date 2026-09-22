# Implementation Plan: Productivity Suggestion Pipeline

Figuring out how productive a user is going to be at a given time, and making the right suggestions for them at that time, is a complex problem. This is a proposed solution.

## Overview

The pipeline trains an AI model (or set of models) to organize a user's schedule for maximum productivity, and to suggest what each user needs in order to become more productive.

## Parameters

### Energy level throughout the day

This would likely start as a pretrained network of the general population and then learn the individual user over time, then it isn't completely inaccurate off the bat. 

To determine how much energy a user has, we can train a small neural network per user. Inputs would include things like:

- Amount of previous work done
- Time of day
- Day of week
- Ambient light/brightness outside
- How productive the user generally is at that time
- Other similar signals

This would likely use a dual-network architecture to determine whether the user is actually working or on a break (lunch, etc.). If the user isn't working, that period is excluded from the energy-level training data.

This network would let the AI learn to estimate a user's energy level from normal, passively available data and their historical output at each hour.

### Personality testing

When a user first joins the system, they should be prompted to take a personality test immediately — or, alternatively, the system can periodically ask questions and use the answers to build up a personality profile over time.

If the users don't immediately want to take the personality test, the system can give them an average score across everything and gradually learn as they answer questions.

### The RAG database

Using energy level, personality testing, workload, and other factors, we'll train a model to turn that data into a vector for querying the RAG database.

This lets the database learn what kinds of suggestions to return — e.g., a competitive suggestion for someone motivated by competition, a curiosity-driven goal for someone with a more curious personality, etc.

### The LLM

After retrieving a suggestion from the RAG database and predicting the user's energy level, we craft a prompt for an LLM to act on — for example, suggesting something to help motivate the user.

The LLM could also handle calendar optimization, though a dedicated neural network or algorithm might be a better fit for that specific task.

We plan to use a hosted LLM via API key, since those are the most capable. We'll likely avoid training or fine-tuning our own model — smaller custom models risk catastrophic forgetting.

### Training

Both the RAG database and the energy-level neural network should keep learning from the amount of work completed each day.

## Other ideas

- Using Claude agents with personality scores. Haven't used Claude agents or skills before — worth looking into.
