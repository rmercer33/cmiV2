# path to data in hierarchy
dpath="wom/english/questions"

for g in $(cat groups.txt); do
	cd ${g}
	for i in $(cat contents.txt); do
		python3 ../../../../audio/generate_vtt.py \
			https://s3.us-east-1.amazonaws.com/assets.christmind.info.v2/audio/${dpath}/${i}.mp3 \
			~/Projects/rick/sam/cmiContent/example/flat/${dpath}/${i:l}.md
	done
	cd ..
done
