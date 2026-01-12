open -ga XQuartz
xhost +127.0.0.1
xhost +localhost
docker compose up -d
docker compose run python-sand python sand.py 100 50 
# xhost -127.0.0.1
# xhost -localhost
