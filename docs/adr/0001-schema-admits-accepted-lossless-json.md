# The generated schema admits exactly the JSON that deserializes without error or loss

`generateSchema` could describe what the serializer writes (canonical), everything the deserializer tolerates, or something in between. We chose: a document is valid iff `deserializeFromObject` turns it into instances without throwing and without silently dropping data. So absent and `null` properties, Dates as ISO strings and both map entry forms are valid, while unknown properties are rejected (`additionalProperties: false`) even though the deserializer ignores them — they would be lost, and rejecting them is what catches typos by the agents and people who write these files.

## Consequences

- The contract options `required`, `nullable: false` and `abstract` shape the schema only; the deserializer stays lenient. A document can therefore deserialize yet fail validation, which is intended.
- Sets get `uniqueItems` only for primitive item types: duplicates are lossy there, but distinct object instances may legitimately serialize to equal JSON.
