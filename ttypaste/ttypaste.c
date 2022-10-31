#include <stdio.h>
#include <fcntl.h>
#include <termios.h>
#include <sys/ioctl.h>
#include <stdlib.h>
#include <unistd.h>
#include <pwd.h>
#include <grp.h>
#include <sys/stat.h>

void stackchar(int fd, char c)
{
  if (ioctl(fd, TIOCSTI, &c) < 0) {
    perror("ioctl");
    exit(1);
  }
}

int main(int argc, char *argv[])
{
  int i, j, fd;
  char c;
  struct stat info;

  if (argc < 3) {
    fprintf(stderr, "Usage: %s /dev/pts/# command ...\n", argv[0]); 
    exit(1);
  }
  if (stat(argv[1], &info) < 0) {
    perror("stat");
    exit(1);
  }
  if (info.st_uid != getuid()) {
    fprintf(stderr, "Cannot open file \"%s\", uids don't match\n", argv[1]);
    exit(1);
  }
  fd = open(argv[1], O_RDONLY);
  if (fd < 0) {
    perror("open");
    exit(1);
  }
  for (i = 2; i < argc; i++) {
    if (i > 2) stackchar(fd, ' ');
    for (j = 0; (c = argv[i][j]); j++) {
      stackchar(fd, c);
    }
  }
  exit(0);
}

