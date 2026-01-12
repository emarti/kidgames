import pygame
import random

pygame.init()

W, H = 400, 400
screen = pygame.display.set_mode((W, H))
clock = pygame.time.Clock()

CELL = 20
snake = [(5, 5)]
direction = (1, 0)
food = (10, 10)

def draw():
    screen.fill((0, 0, 0))
    for x, y in snake:
        pygame.draw.rect(screen, (0, 255, 0), (x*CELL, y*CELL, CELL, CELL))
    fx, fy = food
    pygame.draw.rect(screen, (255, 0, 0), (fx*CELL, fy*CELL, CELL, CELL))
    pygame.display.flip()

running = True
while running:
    clock.tick(10)

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP:    direction = (0, -1)
            if event.key == pygame.K_DOWN:  direction = (0, 1)
            if event.key == pygame.K_LEFT:  direction = (-1, 0)
            if event.key == pygame.K_RIGHT: direction = (1, 0)

    head = (snake[0][0] + direction[0], snake[0][1] + direction[1])

    if head in snake or not (0 <= head[0] < W//CELL and 0 <= head[1] < H//CELL):
        running = False

    snake.insert(0, head)

    if head == food:
        food = (random.randrange(W//CELL), random.randrange(H//CELL))
    else:
        snake.pop()

    draw()

pygame.quit()
