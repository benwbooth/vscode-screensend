CFLAGS = -static

ttypaste: ttypaste.c
	$(CC) $(CFLAGS) -o $@ $<
	sudo chown root $@
	sudo chmod u+s $@

install: ttypaste
	sudo cp ttypaste ttypaste.sh /usr/local/bin
	sudo chown root /usr/local/bin/ttypaste
	sudo chmod u+s /usr/local/bin/ttypaste
