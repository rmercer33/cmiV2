# for i in L13 L14 L15 L16 L17 L18 L19 L20 L21 L22 L23 L24; do
for i in $(cat contents.txt); do
	python3 ../../../audio/generate_vtt.py https://s3.us-east-1.amazonaws.com/assets.christmind.info/wom/audio/polish/wot/${i}.mp3 ~/Projects/rick/sam/cmiContent/example/flat/wom/polish/wot/${i:l}.md
done
