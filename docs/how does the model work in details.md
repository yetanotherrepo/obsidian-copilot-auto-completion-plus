# How does the model work in details?
We use large language models (LLM) to preform fill-in-the-middle auto-completion.
LLM don't do fill-in-the-middle auto-completion out of the box, since (most) LLMs are not trained to do this.
So, we use various prompt engineering techniques to make the LLMs do fill-in-the-middle auto-completion.

### System prompt
The prediction task has been formulated as a mask replacement task.
Using prompt engineering, we can make a Chat-LLM model to perform this task.
To do this, we give the model the following system instructions:

```text
Your job is to predict the most logical text that should be written at the location of the <mask/>.
Return only the text that should replace <mask/>.
Do not include explanations, labels, analysis, Markdown fences, or surrounding text unless the replacement itself needs them.
Your answer can be code, a single word, or multiple sentences.
If the <mask/> is in the middle of a partial sentence, return only the missing word or words needed to complete that sentence.
Do not repeat text that already appears directly before or after the <mask/>.
Use the same language, style, formatting, indentation, and Markdown context as the surrounding text.
```

We then provide the model with the (truncated) text before and after the cursor in the format `<truncated_text_before_cursor> <mask/> <truncated_text_after_cursor>`.
For example, the user message to the model for the Attention formula in the example above would be:

```text
Weighted average of (sequence) elements, with the weights dynamically computed based on an input query and elements' keys. 

The attention weight $a_i$ is calculated as follows:
$$
<mask/>
$$

In this formula we have the following components:
- Value: For each element, we have a feature vector per element we want to average over.
- Score function  $f_{score}(key, query)$: uses the queries and keys to calculate the weights per value. (Typically a simple similarity metric or MLP.)
- Attention weight $\alpha_i$: the amount of attention to put on value $i$.
```

The model then responds with something like:

```text
\alpha_i = \frac{\exp(f_{score}(key_i, query))}{\sum_j \exp(f_{score}(key_j, query))}
```

The default prompt is answer-only, so the response can be inserted directly after postprocessing.
If you use a legacy or custom prompt that includes labels before the final answer, the advanced Answer extraction regex can remove that preamble.

As you can see in the above example, the model only has access to the text in the current document.
This prevents the model from leaking information from other documents that might be privacy-sensitive. 

### Context-aware few shot examples
The above model setup already works quite well, but it can be improved by using context-aware few-shot examples.
The key idea here is that we expect specific types of answers at specific locations in the document.
For example:
- In a math block, we expect latex formulas.
- In a code block, we expect code in the same language as the code block.
- In a list, we expect a new list item.
- In a heading, we expect a new heading that represents the paragraph's content.
- In a paragraph, we expect a new sentence consistent with the text around it.
- etc.

You can probably think of many more examples and rules.
As a result, the system prompt can become long and complex.
Instead, it is easier to prevent this by giving the model some example input and output pairs.
These pairs implicitly show the model what you expect in the response for the given context.
For example, we give the model the following example in a math block.

Input:
```text
# Sample mean
The sample mean, or sometime called average, is defined as:

$$
sample_mean(x) = <mask/>
$$
The average value has the property that 50% of the weighted* value will be above and below it. This weighted property can make it more sensitive to outliers than the median.
```

Output:
```text
\frac{1}{n} \sum_i^n x_i
```

This example is math block specific, so this example will only be included if the cursor is in a math block.
Besides math blocks, we also support a wide range of other contexts, such as:
- Math blocks;
- Code blocks;
- Numbered lists;
- Unordered/bullet lists;
- Task lists;
- Headings;
- Normal text;
- Block quotes;
- etc.

You can find all the examples under the advanced settings.
You can also add your own examples or customize the existing ones.
This way, you tell the model about your specific writing style and expectations.
See the [advanced settings](#advanced-configuration) section for more information.


### Language Matching
The system prompt asks the model to use the same language, style, formatting, indentation, and Markdown context as the surrounding text.
This prompt engineering strategy encourages the model to consider the surrounding text and produce a completion that fits naturally.
While there is no 100% guarantee that the model will respond in the same language, my experience suggests that it is significantly more likely to do so.

Despite all system prompts being in English, the model is capable of providing quality suggestions in other languages. 
This presents a considerable advantage as:
- There is no need to translate the system prompts and few-shot examples into your language;
- It allows for seamless switching between languages;
- English requires fewer tokens than other languages, leading to quicker suggestions and reduced API costs.

| English                                                                                                                                                                                    | Dutch                                                                                                                                                          | Chinese                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![English](../assets/language-detection-english.jpg)                                                                                                                                       | ![Dutch](../assets/language-detection-dutch.jpg)                                                                                                               | ![Chinese](../assets/language-detection-chinese.jpg)                                                                                                                                                       |
| Introduction to Bitcoin                                                                                                                                                                    | Introductie van Bitcoin                                                                                                                                        | 什么是比特币？                                                                                                                                                                                             |

This same approach also works for code blocks and math blocks.
In the few-shot examples, code block examples contain code and math block examples contain LaTeX.
This makes the model more consistent in generating the correct completion without extra explanation.
  
| Python                                                                                                    | TypeScript                                                                                                                                                                                                                | Rust                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![English](../assets/language-detection-python.jpg)                                                       | ![Dutch](../assets/language-detection-typescript.jpg)                                                                                                                                                                     | ![Chinese](../assets/language-detection-rust.jpg)                                                                                                                                                                    |
