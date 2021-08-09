grammar CLE;

cleLabel
    : Pragma Cle (Begin | End)? Label;

Whitespace
    :   [ \t]+
        -> skip
    ;

Newline
    : ('\r' '\n'?
        |   '\n'
      )
      -> skip
    ;
Pragma : '#pragma';
Cle : 'cle';
Begin : 'begin';
End : 'end';
Label : [A-Z]+;