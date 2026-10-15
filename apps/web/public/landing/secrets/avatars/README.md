# Secrets chat avatars

These fictional profile portraits use **Adventurer** by **Lisa Wischofsky**, generated with [DiceBear](https://www.dicebear.com/styles/adventurer/).

- Artwork license: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
- Original artwork: [Adventurer on Figma Community](https://www.figma.com/community/file/1184595184137881796).
- Generator: [DiceBear HTTP API](https://www.dicebear.com/how-to-use/http-api/), version `10.x`.

Each avatar uses a deterministic fictional seed, selected hair/skin colors, a solid circular background, and an 84 × 84 output size. These are generator customizations; the returned SVG drawing has not been hand-edited. Creator and license metadata are retained in each SVG.

## Reproduce

### amara.svg

[Generate amara](https://api.dicebear.com/10.x/adventurer/svg?seed=outray-amara&backgroundColor=c6b0ed&hairVariant=long13&hairColor=2c2022&skinColor=b87555&borderRadius=50&eyesVariant=variant01&mouthVariant=variant01&glassesProbability=0&earringsProbability=0&detailsProbability=0&size=84)

### tobi.svg

[Generate tobi](https://api.dicebear.com/10.x/adventurer/svg?seed=outray-tobi&backgroundColor=7ed4bd&hairVariant=short16&hairColor=1c1a18&skinColor=8d5524&borderRadius=50&eyesVariant=variant01&mouthVariant=variant01&glassesProbability=0&earringsProbability=0&detailsProbability=0&size=84)

### nneka.svg

[Generate nneka](https://api.dicebear.com/10.x/adventurer/svg?seed=outray-nneka&backgroundColor=edc783&hairVariant=long09&hairColor=402620&skinColor=f0b78c&borderRadius=50&eyesVariant=variant01&mouthVariant=variant01&glassesProbability=0&earringsProbability=0&detailsProbability=0&size=84)

The app serves these static files locally. It does not contact DiceBear at runtime.

